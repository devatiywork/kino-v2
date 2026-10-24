mod db;
mod error;
mod library;
mod links;
mod player;
mod settings;
mod torrent;
mod trackers;

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};

use error::AppResult;
use library::{commands as lc, Library};
use player::{commands as pc, Player};
use settings::{commands as sc, SettingsStore};
use torrent::{commands as tc, Torrents, TorrentsOptions};
use trackers::{commands as trc, Trackers};

/// Files passed on the command line (Explorer "Open with", file associations)
#[tauri::command]
fn app_launch_files() -> Vec<String> {
    std::env::args().skip(1).filter(|a| !a.starts_with('-')).collect()
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

/// KINO_TEST_MONITOR=1920x1080 (debug builds): the E2E tests open the window on that monitor
/// and never take the focus from whatever the user is doing
#[cfg(debug_assertions)]
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
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // %APPDATA%\local.kino.app: kino.db and thumbs\ (SPEC 7). KINO_DATA_DIR — a separate
            // folder, so the E2E tests never touch the real history
            let data = match std::env::var_os("KINO_DATA_DIR") {
                Some(dir) => std::path::PathBuf::from(dir),
                None => app.path().app_data_dir()?,
            };
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
            // async runtime. KINO_TEST_OFFLINE (debug builds): no DHT, trackers or UPnP, loopback only
            let offline = cfg!(debug_assertions) && std::env::var_os("KINO_TEST_OFFLINE").is_some();
            let system_downloads = app.path().download_dir().unwrap_or_else(|_| data.join("downloads"));
            let torrents = tauri::async_runtime::block_on(Torrents::start(TorrentsOptions {
                db_path: data.join("kino.db"),
                dir: data.join("torrents"),
                system_downloads,
                settings: settings.clone(),
                offline,
            }))
            .map_err(|e| format!("torrents: {e:#}"))?;
            // A finished torrent's episodes join the library (SPEC 5): the app links them, the
            // torrents and the library never meet
            let (linker, from) = (library.clone(), torrents.clone());
            let notify = app.handle().clone();
            tc::spawn_updates(app.handle().clone(), torrents.clone(), move |done| links::link_finished(&notify, &linker, &from, done));
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
            #[cfg(debug_assertions)]
            place_for_tests(app.handle(), &mut config)?;
            let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
            let size = window.inner_size()?;
            let player = Player::new(app.handle(), library, settings, window.hwnd()?.0 as isize, size.width, size.height)?;
            app.manage(player);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Resized(size) = event {
                if let Some(player) = window.try_state::<Player>() {
                    player.resize_video(size.width, size.height);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_launch_files,
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
            trc::tracker_bookmarks,
            trc::tracker_bookmark_create,
            trc::tracker_bookmark_update,
            trc::tracker_bookmark_delete,
            trc::tracker_bookmark_move,
            trc::tracker_open,
            trc::tracker_layout,
            trc::tracker_go,
            trc::tracker_page,
        ])
        .build(tauri::generate_context!())
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
