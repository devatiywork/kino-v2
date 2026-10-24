//! «Мини-плеер»: the video in a small window of its own above the other windows, while the main
//! window stays free — the downloads, the library, anything. The video window (video_host.rs,
//! mpv inside) moves into it and back: playback goes on, nothing reloads.
//!
//! The mini window is made like the main one (spikes/tauri-mpv/README.md): opaque, with a
//! see-through WebView2 on top of the video, whose page draws the mini player's buttons

use serde::Serialize;
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use super::Player;
use crate::error::{AppError, AppResult};

pub const LABEL: &str = "mini";
/// The main window hears it: back to the player screen (`expand`) or the mini player is gone
pub const CLOSED_EVENT: &str = "player://mini-closed";

/// CSS pixels: the width (the height follows the picture), the smallest size, the gap from the
/// screen's corner above the taskbar
const WIDTH: f64 = 480.0;
const MIN_SIZE: (f64, f64) = (256.0, 144.0);
const MARGIN: f64 = 24.0;

#[derive(Debug, Clone, Serialize)]
struct Closed {
    expand: bool,
}

pub fn is_open(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL).is_some()
}

/// The picture's height for the mini player's width: 16:9 while the size is not known yet,
/// very wide or tall pictures within reason
fn height_for(video: Option<(u32, u32)>) -> f64 {
    let aspect = match video {
        Some((w, h)) if w > 0 && h > 0 => (f64::from(w) / f64::from(h)).clamp(1.0, 2.4),
        _ => 16.0 / 9.0,
    };
    (WIDTH / aspect).round()
}

fn main_window(app: &AppHandle) -> AppResult<WebviewWindow> {
    app.get_webview_window("main").ok_or_else(|| AppError::Task("no main window".into()))
}

/// Opens in the bottom right corner of the main window's screen, sized to the picture
/// (`video` — its width and height), without taking the focus from the main window
pub async fn open(app: &AppHandle, video: Option<(u32, u32)>) -> AppResult<()> {
    if is_open(app) {
        return Ok(());
    }
    let main = main_window(app)?;
    let height = height_for(video);
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title(if cfg!(debug_assertions) { "Kino v2 · dev" } else { "Kino v2" })
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .background_color(Color(0, 0, 0, 0))
        .inner_size(WIDTH, height)
        .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
        .focused(false)
        .visible(false)
        .build()?;
    if let Some(monitor) = main.current_monitor()? {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let size = PhysicalSize::new((WIDTH * scale).round() as u32, (height * scale).round() as u32);
        let margin = (MARGIN * scale).round() as i32;
        let corner = PhysicalPosition::new(
            area.position.x + area.size.width as i32 - size.width as i32 - margin,
            area.position.y + area.size.height as i32 - size.height as i32 - margin,
        );
        // On the screen first: one with another scale resizes the window on its way
        window.set_position(corner)?;
        window.set_size(size)?;
    }
    crate::hide_for_tests(&window);
    window.show()?;
    let size = window.inner_size()?;
    let hwnd = window.hwnd()?.0 as isize;
    // The windows belong to the main thread: the video changes hands there
    let handle = app.clone();
    app.run_on_main_thread(move || handle.state::<Player>().move_video(hwnd, size.width, size.height, true))?;
    Ok(())
}

/// The video goes back into the main window: `expand` — onto its player screen, the main window
/// in front; otherwise paused and out of sight. The mini window goes after this call returns:
/// it may be the one that asked
pub fn close(app: &AppHandle, expand: bool) {
    let Some(window) = app.get_webview_window(LABEL) else { return };
    let player = app.state::<Player>();
    if !expand {
        if let Err(e) = player.set_paused(true) {
            eprintln!("[mini] pause: {e}");
        }
    }
    match main_window(app).and_then(|main| Ok((main.hwnd()?.0 as isize, main.inner_size()?))) {
        Ok((hwnd, size)) => player.move_video(hwnd, size.width, size.height, false),
        Err(e) => eprintln!("[mini] back into the main window: {e}"),
    }
    if expand {
        crate::bring_forward(app);
    } else {
        player.hide_video();
    }
    if let Err(e) = app.emit(CLOSED_EVENT, Closed { expand }) {
        eprintln!("[mini] emit: {e}");
    }
    let destroyed = app.run_on_main_thread(move || {
        if let Err(e) = window.destroy() {
            eprintln!("[mini] destroy: {e}");
        }
    });
    if let Err(e) = destroyed {
        eprintln!("[mini] destroy: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_height_follows_the_picture_within_reason() {
        assert_eq!(height_for(Some((1920, 1080))), 270.0);
        assert_eq!(height_for(None), 270.0);
        assert_eq!(height_for(Some((0, 0))), 270.0);
        // 4:3 is taller, a 2.39:1 film is lower; a portrait video is held square
        assert_eq!(height_for(Some((1440, 1080))), 360.0);
        assert_eq!(height_for(Some((1920, 800))), 200.0);
        assert_eq!(height_for(Some((1080, 1920))), 480.0);
    }
}
