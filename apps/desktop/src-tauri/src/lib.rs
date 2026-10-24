mod background;
mod db;
mod defaults;
mod error;
mod instance;
mod library;
mod links;
mod media_keys;
mod player;
mod power;
mod settings;
mod torrent;
mod trackers;
mod updates;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};

use error::AppResult;
use library::{commands as lc, Library};
use player::{commands as pc, Player};
use settings::{commands as sc, SettingsStore};
use torrent::{commands as tc, Torrents, TorrentsOptions};
use trackers::{commands as trc, Trackers};

/// A later start of Kino handed over what it was started with (SPEC 6 «Одно окно»)
pub const OPEN_EVENT: &str = "app://open";

/// What Kino was started with: files (Explorer "Open with", file associations) and magnet links.
/// A relative path is taken from the folder it was started in
fn launch_args() -> Vec<String> {
    let cwd = std::env::current_dir().ok();
    std::env::args().skip(1).filter(|a| !a.starts_with('-')).map(|arg| absolute(arg, cwd.as_deref())).collect()
}

fn absolute(arg: String, cwd: Option<&Path>) -> String {
    match cwd {
        Some(cwd) if !arg.starts_with("magnet:") && Path::new(&arg).is_relative() => cwd.join(&arg).to_string_lossy().into_owned(),
        _ => arg,
    }
}

/// %APPDATA%\<identifier>: kino.db and thumbs\ (SPEC 7). KINO_DATA_DIR — a separate folder, so
/// the E2E tests never touch the real history
fn data_dir(identifier: &str) -> PathBuf {
    match std::env::var_os("KINO_DATA_DIR") {
        Some(dir) => PathBuf::from(dir),
        None => std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_default().join(identifier),
    }
}

/// The files Kino was started with: the renderer opens them once it is up
#[tauri::command]
fn app_launch_files() -> Vec<String> {
    launch_args()
}

/// A release page in the default browser; only web links, never a program or a file
#[tauri::command]
fn app_open_url(url: String) -> AppResult<()> {
    let url = url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(error::AppError::NotAWebLink(url.to_string()));
    }
    // explorer gets the link as one argument: no shell parses it
    std::process::Command::new("explorer").arg(url).spawn()?;
    Ok(())
}

/// Shows a file or a folder selected in its folder in Explorer (a torrent's content)
#[tauri::command]
fn app_reveal_path(path: String) -> AppResult<()> {
    let target = std::path::Path::new(&path);
    if !target.exists() {
        return Err(error::AppError::NotAFolder(path));
    }
    std::process::Command::new("explorer").arg(format!("/select,{}", target.display())).spawn()?;
    Ok(())
}

/// SPEC 6 «Очистить историю» (the player and the library meet here)
#[tauri::command]
fn app_clear_history(app: AppHandle, player: State<'_, Player>) -> AppResult<()> {
    player.clear_history()?;
    if let Err(e) = app.emit(lc::CHANGED_EVENT, ()) {
        eprintln!("[library] emit: {e}");
    }
    Ok(())
}

/// The main window in front: from the tray, minimized or behind others. The tests' Kino never
/// takes the focus from whatever the user is doing
fn bring_forward(app: &AppHandle) {
    if std::env::var_os("KINO_TEST_MONITOR").is_none() {
        return background::show_main(app);
    }
    if let Some(window) = app.get_webview_window("main") {
        for result in [window.show(), window.unminimize()] {
            if let Err(e) = result {
                eprintln!("[window] show: {e}");
            }
        }
    }
}

/// KINO_TEST_MONITOR=1920x1080: the E2E tests open the window on that monitor and never take
/// the focus from whatever the user is doing
fn place_for_tests(app: &tauri::AppHandle, config: &mut tauri::utils::config::WindowConfig) -> tauri::Result<()> {
    let Ok(wanted) = std::env::var("KINO_TEST_MONITOR") else { return Ok(()) };
    config.focus = false;
    let monitors = app.available_monitors()?;
    let Some(monitor) = monitors.iter().find(|m| format!("{}x{}", m.size().width, m.size().height) == wanted) else {
        eprintln!("[window] no {wanted} monitor, the window stays on the main one");
        return Ok(());
    };
    // Any point of that monitor will do: `center` then centers the window on it
    let (at, size) = (monitor.position(), monitor.size());
    let middle = tauri::PhysicalPosition::new(at.x + size.width as i32 / 2, at.y + size.height as i32 / 2)
        .to_logical::<f64>(monitor.scale_factor());
    (config.x, config.y) = (Some(middle.x), Some(middle.y));
    Ok(())
}

pub fn run() {
    let context = tauri::generate_context!();
    let data = data_dir(&context.config().identifier);
    // SPEC 6 «Одно окно»: a second start hands its files to the running Kino and quits
    let listener = match instance::claim(&data, &launch_args()) {
        instance::Instance::First(listener) => listener,
        instance::Instance::Handed => return,
    };
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            let thumbs = data.join("thumbs");
            std::fs::create_dir_all(&thumbs)?;
            // The page shows the frames through the asset protocol: only this folder
            app.asset_protocol_scope().allow_directory(&thumbs, false)?;
            let library = Arc::new(Library::open(&data.join("kino.db"), thumbs)?);
            app.manage(library.clone());
            let settings = Arc::new(SettingsStore::load(library.clone()));
            library.set_policy(settings.read(sc::library_policy));
            app.manage(settings.clone());

            // Torrents (SPEC 4): their own connection to the same database, the engine on the
            // async runtime. KINO_TEST_OFFLINE: no DHT, trackers or UPnP, loopback only
            let offline = std::env::var_os("KINO_TEST_OFFLINE").is_some();
            // The tests never download into the real «Загрузки» of Windows
            let system_downloads = if offline { data.join("downloads") } else { app.path().download_dir().unwrap_or_else(|_| data.join("downloads")) };
            let torrents = tauri::async_runtime::block_on(Torrents::start(TorrentsOptions {
                db_path: data.join("kino.db"),
                dir: data.join("torrents"),
                system_downloads,
                settings: settings.clone(),
                offline,
            }))
            .map_err(|e| format!("torrents: {e:#}"))?;
            // SPEC 4.6: the tray, unless the E2E tests run (a killed test would leave a dead icon)
            let tray = if offline { None } else { Some(background::Tray::create(app.handle(), torrents.clone(), settings.clone())?) };
            // A finished torrent's episodes join the library (SPEC 5): the app links them, the
            // torrents and the library never meet. And a Windows notification «Скачан»
            let (linker, from, notices) = (library.clone(), torrents.clone(), settings.clone());
            let handle = app.handle().clone();
            tc::spawn_updates(
                app.handle().clone(),
                torrents.clone(),
                move |update| {
                    if let Some(tray) = &tray {
                        tray.update(update);
                    }
                },
                move |done| {
                    links::link_finished(&handle, &linker, &from, done);
                    if !offline {
                        background::notify_finished(&handle, &notices, done);
                    }
                },
            );
            app.manage(torrents.clone());
            // The trackers browser (SPEC 4.5): made when the tab is first opened
            app.manage(Arc::new(Trackers::new(app.handle(), &data.join("kino.db"), &data.join("trackers"))?));

            // New episodes in the library folders since the last run; torrents finished before
            // the library knew where their files came from
            let (handle, rescan, finished) = (app.handle().clone(), library.clone(), torrents);
            std::thread::Builder::new().name("library-rescan".into()).spawn(move || {
                if let Err(e) = rescan.rescan_folders() {
                    eprintln!("[library] rescan: {e}");
                }
                if let Err(e) = links::link_all(&rescan, &finished) {
                    eprintln!("[links] link all: {e:#}");
                }
                if let Err(e) = handle.emit(lc::CHANGED_EVENT, ()) {
                    eprintln!("[library] emit: {e}");
                }
            })?;

            // The main window is made here and not by Tauri itself, so the E2E tests can place it
            let mut config = app.config().app.windows.first().cloned().expect("main window config");
            place_for_tests(app.handle(), &mut config)?;
            let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
            let size = window.inner_size()?;
            let hwnd = window.hwnd()?.0 as isize;
            // SPEC 6 «Медиаклавиши»; not in the tests, whose videos must not take the user's keys
            if !offline {
                match media_keys::MediaSession::attach(app.handle(), hwnd, settings.read(|s| s.media_keys)) {
                    Ok(session) => {
                        let session = Arc::new(session);
                        media_keys::follow_player(app.handle(), session.clone());
                        app.manage(session);
                    }
                    Err(e) => eprintln!("[media] session: {e}"),
                }
            }
            let settings_for_updates = settings.clone();
            let player = Player::new(app.handle(), library, settings, hwnd, size.width, size.height)?;
            app.manage(player);

            // «Проверять обновления»; the tests never ask GitHub (only their own server)
            app.manage(updates::PendingUpdate::default());
            if !offline || std::env::var_os("KINO_UPDATES_URL").is_some() {
                updates::spawn_checks(app.handle().clone(), settings_for_updates);
            }

            // Later starts of Kino: the window comes forward, what they were given opens here
            let handle = app.handle().clone();
            listener.listen(move |args| {
                bring_forward(&handle);
                if let Err(e) = handle.emit(OPEN_EVENT, args) {
                    eprintln!("[instance] emit: {e}");
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::Resized(size) => {
                if let Some(player) = window.try_state::<Player>() {
                    player.resize_video(size.width, size.height);
                }
            }
            // SPEC 4.6: torrents at work — the window hides in the tray, the video stops
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                let to_tray = window.try_state::<Arc<SettingsStore>>().is_some_and(|s| s.read(|s| s.close_to_tray))
                    && window.try_state::<Arc<Torrents>>().is_some_and(|t| t.busy());
                if !to_tray {
                    return;
                }
                api.prevent_close();
                if let Some(player) = window.try_state::<Player>() {
                    if let Err(e) = player.stop() {
                        eprintln!("[window] stop the video: {e}");
                    }
                }
                if let Err(e) = window.hide() {
                    eprintln!("[window] hide: {e}");
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            app_launch_files,
            defaults::app_default_handlers,
            updates::app_check_update,
            updates::app_take_update,
            defaults::app_open_default_apps,
            app_clear_history,
            app_open_url,
            app_reveal_path,
            pc::player_snapshot,
            pc::player_open,
            pc::player_open_neighbor,
            pc::player_stop,
            pc::player_set_paused,
            pc::player_seek,
            pc::player_set_volume,
            pc::player_set_muted,
            pc::player_set_speed,
            pc::player_set_audio,
            pc::player_set_subtitle,
            pc::player_set_subtitles_visible,
            pc::player_set_subtitle_margin,
            pc::player_set_right_margin,
            pc::player_set_video_visible,
            lc::library_continue_watching,
            lc::library_history,
            lc::library_series,
            lc::library_series_detail,
            lc::library_search,
            links::app_series_sources,
            links::app_season_space,
            links::app_free_season,
            lc::library_folders,
            lc::library_add_folder,
            lc::library_remove_folder,
            lc::app_reveal_folder,
            sc::settings_get,
            sc::settings_update,
            sc::settings_reset,
            tc::torrent_list,
            tc::torrent_categories,
            tc::torrent_category_create,
            tc::torrent_category_update,
            tc::torrent_category_delete,
            tc::torrent_preview,
            tc::torrent_add,
            tc::torrent_pause,
            tc::torrent_resume,
            tc::torrent_pause_all,
            tc::torrent_remove,
            tc::torrent_archive_seeding,
            tc::torrent_set_category,
            tc::torrent_set_source,
            tc::torrent_set_files,
            tc::torrent_details,
            tc::torrent_archive,
            tc::torrent_download_again,
            tc::torrent_seed_again,
            tc::torrent_delete_record,
            tc::torrent_magnet,
            tc::torrent_downloads_folder,
            tc::torrent_export_archive,
            tc::torrent_restore_archive,
            tc::torrent_set_seeding,
            tc::torrent_recheck,
            tc::torrent_reannounce,
            tc::torrent_save_file,
            tc::torrent_speed_history,
            links::app_move_torrent,
            trc::tracker_bookmarks,
            trc::tracker_password_saving,
            trc::tracker_clear_passwords,
            trc::tracker_bookmark_create,
            trc::tracker_bookmark_update,
            trc::tracker_bookmark_delete,
            trc::tracker_bookmark_move,
            trc::tracker_open,
            trc::tracker_layout,
            trc::tracker_go,
            trc::tracker_page,
        ])
        .build(context)
        .expect("error while building Kino");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(player) = app.try_state::<Player>() {
                player.shutdown();
            }
            if let Some(torrents) = app.try_state::<Arc<Torrents>>() {
                tauri::async_runtime::block_on(torrents.shutdown());
            }
        }
    });
}
