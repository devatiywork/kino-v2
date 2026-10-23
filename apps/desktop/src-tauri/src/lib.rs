mod db;
mod error;
mod library;
mod player;

use std::sync::Arc;

use tauri::{Manager, RunEvent, WindowEvent};

use library::{commands as lc, Library};
use player::{commands as pc, Player};

/// Files passed on the command line (Explorer "Open with", file associations)
#[tauri::command]
fn app_launch_files() -> Vec<String> {
    std::env::args().skip(1).filter(|a| !a.starts_with('-')).collect()
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // %APPDATA%\local.kino.app: kino.db and thumbs\ (SPEC 7)
            let data = app.path().app_data_dir()?;
            let thumbs = data.join("thumbs");
            std::fs::create_dir_all(&thumbs)?;
            let library = Arc::new(Library::open(&data.join("kino.db"), thumbs)?);
            app.manage(library.clone());

            let window = app.get_webview_window("main").expect("main window");
            let size = window.inner_size()?;
            let player = Player::new(app.handle(), library, window.hwnd()?.0 as isize, size.width, size.height)?;
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
            pc::player_snapshot,
            pc::player_open,
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
            pc::player_set_video_visible,
            lc::library_continue_watching,
            lc::library_history,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Kino");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(player) = app.try_state::<Player>() {
                player.shutdown();
            }
        }
    });
}
