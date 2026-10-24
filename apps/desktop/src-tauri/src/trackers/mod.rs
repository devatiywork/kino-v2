//! The trackers browser (SPEC 4.5): web pages inside Kino, in a webview of its own laid over the
//! «Трекеры» tab. The page is remote: Tauri gives a remote origin no command unless a capability
//! names its URL, and none does. What the page tries to do is decided here: downloads of .torrent
//! files and magnet links become the add dialog, any other page — of whatever site — stays
//! inside (nothing goes to the default browser by itself), Kino's own pages are out of reach
//! (rules.rs). Back and forward go through WebView2's own history (history.rs).

mod adblock;
mod blocking;
pub mod commands;
mod history;
pub mod rules;
pub mod store;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewBuilder, WebviewUrl};

use crate::db::now_ms;
use crate::error::AppResult;
use crate::settings::SettingsStore;
use adblock::AdBlocker;
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
/// A download that is not a .torrent: not saved (SPEC 4.5 — the trackers browser brings torrents)
pub const REFUSED_EVENT: &str = "trackers://refused";

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageState {
    pub url: Option<String>,
    pub loading: bool,
    /// There is a page to go back / forward to
    pub can_go_back: bool,
    pub can_go_forward: bool,
    /// Ad requests stopped on this page
    pub blocked_ads: u32,
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

/// A download the trackers browser did not keep: its name
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Refused {
    pub name: String,
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
    /// The last address the page went to: its own navigation is never blocked
    navigating: Mutex<Option<String>>,
    blocked_ads: AtomicU32,
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
            page.blocked_ads = self.blocked_ads.load(Ordering::Relaxed);
            page.clone()
        };
        self.emit(STATE_EVENT, state);
    }

    /// A navigation or a new window: true — it opens in the trackers browser
    fn decide(&self, url: &Url) -> bool {
        match rules::classify(url, &self.app_origins) {
            Navigation::Allow => {
                *lock(&self.navigating) = Some(url.to_string());
                true
            }
            Navigation::Magnet => {
                self.emit(MAGNET_EVENT, Intercepted { target: url.to_string(), source_url: self.source() });
                false
            }
            Navigation::Block => false,
        }
    }

    /// Only a .torrent is kept, in Kino's own folder, never in Windows' Downloads. A plainly
    /// other file (setup.exe from an ad) does not download at all; one the name tells nothing of
    /// (dl.php) downloads there and is kept only if it is a .torrent inside
    fn download(&self, event: DownloadEvent<'_>) -> bool {
        match event {
            DownloadEvent::Requested { url, destination } => match rules::download_kind(&url, destination) {
                rules::DownloadKind::Torrent | rules::DownloadKind::Unknown => {
                    let name = destination.file_name().and_then(|n| n.to_str()).unwrap_or("download");
                    let name: String = name.chars().map(|ch| if ch.is_alphanumeric() || ".-_[]".contains(ch) { ch } else { '_' }).collect();
                    *destination = self.downloads_dir.join(format!("{}-{name}", now_ms()));
                    true
                }
                rules::DownloadKind::Other(name) => {
                    self.emit(REFUSED_EVENT, Refused { name });
                    false
                }
            },
            DownloadEvent::Finished { path, success, .. } => {
                if let Some(path) = path.filter(|p| success && p.starts_with(&self.downloads_dir)) {
                    self.finished(&path);
                }
                true
            }
            _ => true,
        }
    }

    /// A download in Kino's folder: a .torrent goes to the add dialog, anything else is deleted
    fn finished(&self, path: &Path) {
        let name = path.file_name().and_then(|n| n.to_str()).and_then(|n| n.split_once('-')).map(|(_, name)| name.to_string()).unwrap_or_default();
        let is_torrent = std::fs::metadata(path).is_ok_and(|m| m.len() <= rules::TORRENT_MAX_BYTES)
            && std::fs::read(path).is_ok_and(|bytes| rules::is_torrent_file(&bytes));
        if !is_torrent {
            if let Err(e) = std::fs::remove_file(path) {
                eprintln!("[trackers] remove {}: {e}", path.display());
            }
            return self.emit(REFUSED_EVENT, Refused { name });
        }
        // dl.php that was a .torrent: the add dialog and the archive see a .torrent
        let target = if name.to_lowercase().ends_with(".torrent") {
            path.to_path_buf()
        } else {
            let renamed = path.with_extension("torrent");
            match std::fs::rename(path, &renamed) {
                Ok(()) => renamed,
                Err(e) => {
                    eprintln!("[trackers] rename {}: {e}", path.display());
                    path.to_path_buf()
                }
            }
        };
        self.emit(TORRENT_EVENT, Intercepted { target: target.to_string_lossy().into_owned(), source_url: self.source() });
    }
}

pub struct Trackers {
    store: BookmarkStore,
    shared: Arc<Shared>,
    webview: Mutex<Option<Webview>>,
    /// Parsed once, off the main thread, from Kino's start
    blocker: Arc<AdBlocker>,
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
                navigating: Mutex::default(),
                blocked_ads: AtomicU32::new(0),
            }),
            webview: Mutex::default(),
            // Parsed in the background from the start: the first page of the tab is already clean
            blocker: AdBlocker::start(),
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
                let started = matches!(payload.event(), PageLoadEvent::Started);
                if started {
                    on_load.blocked_ads.store(0, Ordering::Relaxed);
                }
                on_load.update_page(|page| {
                    page.url = Some(payload.url().to_string());
                    page.loading = started;
                });
            });
        let created = window.add_child(builder, LogicalPosition::new(bounds.x, bounds.y), LogicalSize::new(bounds.width, bounds.height))?;
        let (for_page, for_count, settings) = (self.shared.clone(), self.shared.clone(), self.shared.app.state::<Arc<SettingsStore>>().inner().clone());
        blocking::attach(
            &created,
            blocking::Context {
                // Its engine may still be parsing the list: then nothing is blocked yet
                blocker: self.blocker.clone(),
                enabled: Box::new(move || settings.read(|s| s.block_ads)),
                page: Box::new(move || lock(&for_page.navigating).clone().or_else(|| lock(&for_page.page).url.clone())),
                blocked: Box::new(move || {
                    for_count.blocked_ads.fetch_add(1, Ordering::Relaxed);
                }),
            },
        )?;
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
