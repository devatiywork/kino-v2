//! The trackers browser (SPEC 4.5): web pages inside Kino, in a webview of its own laid over the
//! «Трекеры» tab. The page is remote: Tauri gives a remote origin no command unless a capability
//! names its URL, and none does. What the page tries to do is decided here: downloads of .torrent
//! files and magnet links become the add dialog, any other page — of whatever site — stays
//! inside (nothing goes to the default browser by itself), Kino's own pages are out of reach
//! (rules.rs). Back and forward go through WebView2's own history (history.rs).

pub mod commands;
mod history;
pub mod rules;
pub mod store;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewBuilder, WebviewUrl};

use crate::db::now_ms;
use crate::error::AppResult;
use rules::Navigation;
use store::BookmarkStore;

/// The webview's label: no capability lists it, and its pages are remote anyway
pub const LABEL: &str = "trackers";
/// Address and loading of the page — for the toolbar
pub const STATE_EVENT: &str = "trackers://state";
/// A .torrent was downloaded on the tracker (into Kino's folder, not Windows' Downloads)
pub const TORRENT_EVENT: &str = "trackers://torrent";
/// A magnet link was clicked
pub const MAGNET_EVENT: &str = "trackers://magnet";

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageState {
    pub url: Option<String>,
    pub loading: bool,
    /// There is a page to go back / forward to
    pub can_go_back: bool,
    pub can_go_forward: bool,
}

/// What the tracker gave: a .torrent file or a magnet link, and the page it came from
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Intercepted {
    /// A path (.torrent) or a magnet link
    pub target: String,
    /// The release page: it goes into the archive
    pub source_url: Option<String>,
}

/// Where the page lies in the main window, in CSS pixels
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// What the webview's handlers share with the commands
struct Shared {
    app: AppHandle,
    page: Mutex<PageState>,
    downloads_dir: PathBuf,
    app_origins: Vec<Url>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Shared {
    fn emit<T: Serialize + Clone>(&self, event: &str, payload: T) {
        if let Err(e) = self.app.emit_to(tauri::EventTarget::webview("main"), event, payload) {
            eprintln!("[trackers] emit {event}: {e}");
        }
    }

    fn source(&self) -> Option<String> {
        lock(&self.page).url.clone()
    }

    /// Changes the page's state and tells the toolbar
    fn update_page(&self, change: impl FnOnce(&mut PageState)) {
        let state = {
            let mut page = lock(&self.page);
            change(&mut page);
            page.clone()
        };
        self.emit(STATE_EVENT, state);
    }

    /// A navigation or a new window: true — it opens in the trackers browser
    fn decide(&self, url: &Url) -> bool {
        match rules::classify(url, &self.app_origins) {
            Navigation::Allow => true,
            Navigation::Magnet => {
                self.emit(MAGNET_EVENT, Intercepted { target: url.to_string(), source_url: self.source() });
                false
            }
            Navigation::Block => false,
        }
    }

    /// A .torrent goes into Kino's own folder; anything else downloads as usual
    fn download(&self, event: DownloadEvent<'_>) -> bool {
        match event {
            DownloadEvent::Requested { url, destination } => {
                if rules::is_torrent_download(&url, destination) {
                    let name = destination.file_name().and_then(|n| n.to_str()).unwrap_or("download.torrent");
                    let name: String = name.chars().map(|ch| if ch.is_alphanumeric() || ".-_[]".contains(ch) { ch } else { '_' }).collect();
                    let name = if name.to_lowercase().ends_with(".torrent") { name } else { format!("{name}.torrent") };
                    *destination = self.downloads_dir.join(format!("{}-{name}", now_ms()));
                }
                true
            }
            DownloadEvent::Finished { path, success, .. } => {
                if let Some(path) = path.filter(|p| success && p.starts_with(&self.downloads_dir)) {
                    self.emit(TORRENT_EVENT, Intercepted { target: path.to_string_lossy().into_owned(), source_url: self.source() });
                }
                true
            }
            _ => true,
        }
    }
}

pub struct Trackers {
    store: BookmarkStore,
    shared: Arc<Shared>,
    webview: Mutex<Option<Webview>>,
}

impl Trackers {
    /// `dir` — `<data>\trackers`: intercepted .torrent files wait there for the add dialog
    pub fn new(app: &AppHandle, db_path: &Path, dir: &Path) -> AppResult<Self> {
        let downloads_dir = dir.join("downloads");
        // What the last run left: the archive keeps its own copies
        if downloads_dir.exists() {
            std::fs::remove_dir_all(&downloads_dir)?;
        }
        std::fs::create_dir_all(&downloads_dir)?;
        let mut app_origins = vec![Url::parse("http://tauri.localhost/").expect("a valid URL")];
        app_origins.extend(app.config().build.dev_url.clone());
        Ok(Self {
            store: BookmarkStore::open(db_path)?,
            shared: Arc::new(Shared {
                app: app.clone(),
                page: Mutex::default(),
                downloads_dir,
                app_origins,
            }),
            webview: Mutex::default(),
        })
    }

    pub fn store(&self) -> &BookmarkStore {
        &self.store
    }

    pub fn page(&self) -> PageState {
        lock(&self.shared.page).clone()
    }

    /// A bookmark or a typed address; the first time the webview is made
    pub fn open(&self, url: Url, bounds: Bounds) -> AppResult<()> {
        let mut webview = lock(&self.webview);
        if let Some(existing) = webview.as_ref() {
            existing.navigate(url)?;
            drop(webview);
            return self.layout(Some(bounds));
        }
        let window = self.shared.app.get_window("main").ok_or(tauri::Error::WindowNotFound)?;
        let (on_nav, on_new, on_download, on_load, on_history) =
            (self.shared.clone(), self.shared.clone(), self.shared.clone(), self.shared.clone(), self.shared.clone());
        let builder = WebviewBuilder::new(LABEL, WebviewUrl::External(url))
            .on_navigation(move |url| on_nav.decide(url))
            .on_new_window(move |url, _features| {
                // target=_blank and window.open: in place, there is one page
                if on_new.decide(&url) {
                    if let Some(webview) = on_new.app.get_webview(LABEL) {
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = webview.navigate(url) {
                                eprintln!("[trackers] open in place: {e}");
                            }
                        });
                    }
                }
                NewWindowResponse::Deny
            })
            .on_download(move |_webview, event| on_download.download(event))
            .on_page_load(move |_webview, payload| {
                on_load.update_page(|page| {
                    page.url = Some(payload.url().to_string());
                    page.loading = matches!(payload.event(), PageLoadEvent::Started);
                });
            });
        let created = window.add_child(builder, LogicalPosition::new(bounds.x, bounds.y), LogicalSize::new(bounds.width, bounds.height))?;
        history::watch(&created, move |back, forward| {
            on_history.update_page(|page| {
                page.can_go_back = back;
                page.can_go_forward = forward;
            });
        })?;
        *webview = Some(created);
        Ok(())
    }

    /// Over the tab (`Some`) or hidden: another screen, a dialog over it
    pub fn layout(&self, bounds: Option<Bounds>) -> AppResult<()> {
        let webview = lock(&self.webview);
        let Some(webview) = webview.as_ref() else { return Ok(()) };
        match bounds {
            Some(b) => {
                webview.set_position(LogicalPosition::new(b.x, b.y))?;
                webview.set_size(LogicalSize::new(b.width.max(1.0), b.height.max(1.0)))?;
                webview.show()?;
            }
            None => webview.hide()?,
        }
        Ok(())
    }

    /// The toolbar: back, forward, reload
    pub fn go(&self, action: &str) -> AppResult<()> {
        let webview = lock(&self.webview);
        let Some(webview) = webview.as_ref() else { return Ok(()) };
        match action {
            "back" => history::step(webview, true)?,
            "forward" => history::step(webview, false)?,
            _ => webview.reload()?,
        }
        Ok(())
    }
}
