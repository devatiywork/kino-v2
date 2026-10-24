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
mod shell;
mod torrent;
mod trackers;
mod updates;

use std::path::{Path, PathBuf};
use std::time::Duration;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};

use error::AppResult;
use library::{commands as lc, Library};
use player::{commands as pc, mini, Player};
use settings::{commands as sc, SettingsStore};
use torrent::{commands as tc, Torrents, TorrentsOptions};
use trackers::{commands as trc, Trackers};

/// A later start of Kino handed over what it was started with (SPEC 6 «Одно окно»)
pub const OPEN_EVENT: &str = "app://open";
/// The window went to the tray and the video stopped: the renderer leaves the player
pub const TO_TRAY_EVENT: &str = "app://to-tray";

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

/// %APPDATA%\<identifier>: kino.db and thumbs\ (SPEC 7). A debug build (bun run dev) has its own
/// %APPDATA%\<identifier>.dev: it never shares the history, the torrents or the one window with
/// the installed Kino. KINO_DATA_DIR — a separate folder, so the E2E tests never touch either
fn data_dir(identifier: &str) -> PathBuf {
    if let Some(dir) = std::env::var_os("KINO_DATA_DIR") {
        return PathBuf::from(dir);
    }
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_default();
    if cfg!(debug_assertions) {
        appdata.join(format!("{identifier}.dev"))
    } else {
        appdata.join(identifier)
    }
}

/// The debug build's WebView2 profile (the trackers' logins and passwords) is in its data folder
/// too: two WebView2 apps on one profile fail, and the installed Kino keeps its own. Set before
/// any thread or webview exists
fn separate_webview_profile(data: &Path) {
    if cfg!(debug_assertions) && std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", data.join("webview2"));
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
    Ok(shell::reveal(target)?)
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

/// Kino quits (the window closed with nothing at work, «Выйти» of the tray). The window hides at
/// once; the rest happens on a thread of its own while the main thread keeps pumping messages:
/// mpv stops (its video thread talks to the window), the torrents save their state and stop, the
/// tray icon goes — then the process ends right there. The usual way out (tao tearing the windows
/// down, then ExitProcess unloading the DLLs) hangs for good once a video was shown — the video
/// driver's DLL waits for itself on unload — and Kino stayed with no window: a dead tray icon,
/// later starts handed over to it for nothing
pub fn quit(app: &AppHandle) {
    for label in ["main", mini::LABEL] {
        if let Some(window) = app.get_webview_window(label) {
            if let Err(e) = window.hide() {
                eprintln!("[window] hide {label}: {e}");
            }
        }
    }
    let handle = app.clone();
    let spawned = std::thread::Builder::new().name("quit".into()).spawn(move || {
        let app = handle;
        if let Some(player) = app.try_state::<Player>() {
            player.shutdown();
            if !player.wait_stopped(Duration::from_secs(4)) {
                eprintln!("[player] mpv did not stop in time");
            }
        }
        if let Some(torrents) = app.try_state::<Arc<Torrents>>() {
            let torrents = torrents.inner().clone();
            // The timer is made on the runtime: it needs its clock
            let stopped = tauri::async_runtime::block_on(async move { tokio::time::timeout(Duration::from_secs(6), torrents.shutdown()).await });
            if stopped.is_err() {
                eprintln!("[torrents] did not stop in time");
            }
        }
        end_process(&app);
    });
    if let Err(e) = spawned {
        eprintln!("[app] quit thread: {e}");
        app.exit(0);
    }
}

/// The end, past the DLL unloading that may hang: the tray icon is taken away first (a killed
/// process leaves a dead one), WebView2's own processes see Kino gone and close by themselves
fn end_process(app: &AppHandle) -> ! {
    if let Some(tray) = app.remove_tray_by_id("kino") {
        if let Err(e) = tray.set_visible(false) {
            eprintln!("[tray] remove: {e}");
        }
    }
    // SAFETY: ends this very process; everything worth keeping is saved by now
    unsafe {
        let _ = windows::Win32::System::Threading::TerminateProcess(windows::Win32::System::Threading::GetCurrentProcess(), 0);
    }
    std::process::exit(0)
}

/// However the exit goes, a Kino with no window does not live on: past this it ends anyway
const EXIT_DEADLINE: Duration = Duration::from_secs(8);

/// The main window in front: from the tray, minimized or behind others. The tests' Kino never
/// takes the focus from whatever the user is doing
pub(crate) fn bring_forward(app: &AppHandle) {
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

/// KINO_TEST_HIDDEN: the E2E tests' windows are cloaked — Windows still draws them and the tests
/// drive them, but the user sees none of them, fullscreen ones included, nor in the taskbar or
/// Alt+Tab. Called on a window not shown yet
pub(crate) fn hide_for_tests(window: &tauri::WebviewWindow) {
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_CLOAK};
    if std::env::var_os("KINO_TEST_HIDDEN").is_none() {
        return;
    }
    if let Err(e) = window.set_skip_taskbar(true) {
        eprintln!("[window] skip taskbar: {e}");
    }
    let cloaked = match window.hwnd() {
        Ok(hwnd) => {
            let on = windows::core::BOOL(1);
            // SAFETY: a window of this process, a BOOL of the size given
            unsafe {
                DwmSetWindowAttribute(
                    windows::Win32::Foundation::HWND(hwnd.0 as *mut _),
                    DWMWA_CLOAK,
                    std::ptr::from_ref(&on).cast(),
                    std::mem::size_of::<windows::core::BOOL>() as u32,
                )
            }
            .map_err(|e| e.to_string())
        }
        Err(e) => Err(e.to_string()),
    };
    if let Err(e) = cloaked {
        eprintln!("[window] cloak: {e}");
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
    separate_webview_profile(&data);
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
            // KINO_TEST_TRAY: the tray in a test run too, to check the way back from it
            let with_tray = !offline || std::env::var_os("KINO_TEST_TRAY").is_some();
            let tray = if with_tray { Some(background::Tray::create(app.handle(), torrents.clone(), settings.clone())?) } else { None };
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
            // A debug build says so in the taskbar and Alt+Tab: it is not the installed Kino
            if cfg!(debug_assertions) {
                config.title = format!("{} · dev", config.title);
            }
            let hidden = std::env::var_os("KINO_TEST_HIDDEN").is_some();
            if hidden {
                config.visible = false;
            }
            let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
            if hidden {
                hide_for_tests(&window);
                window.show()?;
            }
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
                    player.resize_video(size.width, size.height, window.label() == mini::LABEL);
                }
            }
            // Alt+F4 on the mini player: as its ✕ — paused, gone. With the main window in the tray
            // and nothing at work, nothing of Kino is left to keep running
            WindowEvent::CloseRequested { api, .. } if window.label() == mini::LABEL => {
                api.prevent_close();
                let app = window.app_handle();
                mini::close(app, false);
                let main_hidden = app.get_webview_window("main").is_some_and(|w| !w.is_visible().unwrap_or(true));
                if main_hidden && !app.try_state::<Arc<Torrents>>().is_some_and(|t| t.busy()) {
                    quit(app);
                }
            }
            // SPEC 4.6: torrents at work, or the mini player playing — the window hides in the tray
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                let in_mini = mini::is_open(window.app_handle());
                let to_tray = window.try_state::<Arc<SettingsStore>>().is_some_and(|s| s.read(|s| s.close_to_tray))
                    && (in_mini || window.try_state::<Arc<Torrents>>().is_some_and(|t| t.busy()));
                // Either way the window is not destroyed under mpv: quitting stops it first
                api.prevent_close();
                if !to_tray {
                    return quit(window.app_handle());
                }
                // The mini player plays on: the main window just goes
                if in_mini {
                    if let Err(e) = window.hide() {
                        eprintln!("[window] hide: {e}");
                    }
                    return;
                }
                if let Some(player) = window.try_state::<Player>() {
                    if let Err(e) = player.stop() {
                        eprintln!("[window] stop the video: {e}");
                    }
                }
                // It comes back from the tray as a window with the screen before the player, not an
                // empty player over the whole screen that looks like nothing came back
                if let Err(e) = window.set_fullscreen(false) {
                    eprintln!("[window] leave fullscreen: {e}");
                }
                if let Err(e) = window.app_handle().emit(TO_TRAY_EVENT, ()) {
                    eprintln!("[window] emit: {e}");
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
            pc::player_enter_mini,
            pc::player_leave_mini,
            lc::library_continue_watching,
            lc::library_history,
            lc::library_series,
            lc::library_films,
            lc::library_series_detail,
            lc::library_search,
            links::app_series_sources,
            links::app_library_torrents,
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
            trc::tracker_close,
            trc::tracker_layout,
            trc::tracker_go,
            trc::tracker_page,
        ])
        .build(context)
        .expect("error while building Kino");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            let handle = app.clone();
            let watchdog = std::thread::Builder::new().name("exit-deadline".into()).spawn(move || {
                std::thread::sleep(EXIT_DEADLINE);
                eprintln!("[app] the exit hangs: ending the process");
                end_process(&handle);
            });
            if let Err(e) = watchdog {
                eprintln!("[app] exit deadline: {e}");
            }
            // Already done when Kino quit through `quit`; not when Windows ends the session
            if let Some(player) = app.try_state::<Player>() {
                player.shutdown();
            }
            if let Some(torrents) = app.try_state::<Arc<Torrents>>() {
                tauri::async_runtime::block_on(torrents.shutdown());
            }
        }
    });
}
