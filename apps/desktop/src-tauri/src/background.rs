//! Kino in the background (SPEC 4.6): the tray icon with the speeds, «Пауза всех», «Открыть»,
//! «Выйти»; a Windows notification when a torrent finishes. Closing the window while torrents
//! download or seed hides it here (lib.rs decides). The E2E tests run without both: a killed
//! test process would leave a dead icon in the tray and notifications on the user's screen.

use std::sync::{Arc, Mutex};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_notification::NotificationExt;

use crate::settings::{Language, SettingsStore};
use crate::torrent::{Finished, TorrentState, Torrents, TorrentsUpdate};

/// The tray's name, as in the Start menu (productName): Kino v1 next to it is «Kino». A debug
/// build's icon says it is not the installed one
const APP_NAME: &str = if cfg!(debug_assertions) { "Kino v2 · dev" } else { "Kino v2" };

struct Labels {
    open: &'static str,
    pause_all: &'static str,
    resume_all: &'static str,
    quit: &'static str,
    finished: &'static str,
    archived: &'static str,
    in_folder: &'static str,
}

fn labels(language: Language) -> Labels {
    match language {
        Language::Ru => Labels {
            open: "Открыть Kino v2",
            pause_all: "Пауза всех",
            resume_all: "Продолжить все",
            quit: "Выйти",
            finished: "Скачан",
            archived: "Раздача остановлена, торрент в архиве — файлы на месте",
            in_folder: "Файлы в папке",
        },
        Language::En => Labels {
            open: "Open Kino v2",
            pause_all: "Pause all",
            resume_all: "Resume all",
            quit: "Quit",
            finished: "Downloaded",
            archived: "Seeding stopped, the torrent is in the archive — the files stay",
            in_folder: "Files are in",
        },
    }
}

/// «2,1 МБ/с» / «2.1 MB/s»: the tooltip has no room for more
pub fn rate(bytes_per_second: u64, language: Language) -> String {
    let (units, comma) = match language {
        Language::Ru => (["Б/с", "кБ/с", "МБ/с", "ГБ/с"], true),
        Language::En => (["B/s", "kB/s", "MB/s", "GB/s"], false),
    };
    let mut value = bytes_per_second as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < units.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    let text = if unit == 0 || value >= 100.0 { format!("{value:.0}") } else { format!("{value:.1}") };
    let text = if comma { text.replace('.', ",") } else { text };
    format!("{text} {}", units[unit])
}

/// The main window back from the tray (or from under other windows)
pub fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    for (what, result) in [("show", window.show()), ("unminimize", window.unminimize()), ("focus", window.set_focus())] {
        if let Err(e) = result {
            eprintln!("[tray] {what}: {e}");
        }
    }
}

pub struct Tray {
    icon: TrayIcon,
    pause: MenuItem<Wry>,
    settings: Arc<SettingsStore>,
    /// What «Пауза всех» does now: pause (false) or resume (true) — the menu follows the torrents
    resume: Arc<Mutex<bool>>,
}

impl Tray {
    pub fn create(app: &AppHandle, torrents: Arc<Torrents>, settings: Arc<SettingsStore>) -> tauri::Result<Self> {
        let text = labels(settings.read(|s| s.language));
        let open = MenuItem::with_id(app, "open", text.open, true, None::<&str>)?;
        let pause = MenuItem::with_id(app, "pause", text.pause_all, true, None::<&str>)?;
        let quit = MenuItem::with_id(app, "quit", text.quit, true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&open, &pause, &PredefinedMenuItem::separator(app)?, &quit])?;
        let resume = Arc::new(Mutex::new(false));
        let wants_resume = resume.clone();
        let mut builder = TrayIconBuilder::with_id("kino")
            .tooltip(APP_NAME)
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(move |app, event| match event.id().as_ref() {
                "open" => show_main(app),
                "pause" => {
                    let paused = !*wants_resume.lock().unwrap_or_else(|p| p.into_inner());
                    let torrents = torrents.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = torrents.pause_all(paused).await {
                            eprintln!("[tray] pause all: {e:#}");
                        }
                    });
                }
                "quit" => crate::quit(app),
                _ => {}
            })
            .on_tray_icon_event(|icon, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    show_main(icon.app_handle());
                }
            });
        if let Some(image) = app.default_window_icon() {
            builder = builder.icon(image.clone());
        }
        Ok(Self { icon: builder.build(app)?, pause, settings, resume })
    }

    /// Every second: the speeds in the tooltip; «Продолжить все» when everything is paused
    pub fn update(&self, update: &TorrentsUpdate) {
        let language = self.settings.read(|s| s.language);
        let text = labels(language);
        let tooltip = if update.torrents.is_empty() {
            APP_NAME.to_string()
        } else {
            format!("{APP_NAME}\n↓ {} · ↑ {}", rate(update.download_speed, language), rate(update.upload_speed, language))
        };
        if let Err(e) = self.icon.set_tooltip(Some(tooltip)) {
            eprintln!("[tray] tooltip: {e}");
        }
        let resume = !update.torrents.is_empty() && update.torrents.iter().all(|t| t.state == TorrentState::Paused);
        *self.resume.lock().unwrap_or_else(|p| p.into_inner()) = resume;
        if let Err(e) = self.pause.set_text(if resume { text.resume_all } else { text.pause_all }) {
            eprintln!("[tray] pause item: {e}");
        }
    }
}

/// SPEC 4.6: «Скачан» — the torrent and where its files are
pub fn notify_finished(app: &AppHandle, settings: &SettingsStore, done: &Finished) {
    let (wanted, language) = settings.read(|s| (s.notify_finished, s.language));
    if !wanted {
        return;
    }
    let text = labels(language);
    let body = if done.archived { text.archived.to_string() } else { format!("{} {}", text.in_folder, done.item.save_dir) };
    let shown = app.notification().builder().title(format!("{} «{}»", text.finished, done.item.name)).body(body).show();
    if let Err(e) = shown {
        eprintln!("[notify] {}: {e}", done.item.name);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn speeds_for_the_tooltip() {
        assert_eq!(rate(0, Language::Ru), "0 Б/с");
        assert_eq!(rate(300 * 1024, Language::Ru), "300 кБ/с");
        assert_eq!(rate(2_202_009, Language::Ru), "2,1 МБ/с");
        assert_eq!(rate(2_202_009, Language::En), "2.1 MB/s");
        assert_eq!(rate(5 * 1024 * 1024 * 1024, Language::En), "5.0 GB/s");
    }
}
