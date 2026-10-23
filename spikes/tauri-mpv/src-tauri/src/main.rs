// Spike: libmpv renders into our own child HWND that sits at the bottom of the
// z-order, under the transparent WebView2. The page draws the UI on top.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use libmpv2::Mpv;
use serde::Serialize;
use serde_json::Value;
use tauri::{DragDropEvent, Manager, State, WindowEvent};
use windows::core::w;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetStockObject, BLACK_BRUSH, HBRUSH};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, RegisterClassW, SetWindowPos, ShowWindow, HTTRANSPARENT,
    HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNA, WINDOW_EX_STYLE,
    WM_NCHITTEST, WNDCLASSW, WS_CHILD, WS_CLIPCHILDREN, WS_DISABLED, WS_VISIBLE,
};

struct Player {
    mpv: Mpv,
    /// Video host HWND (raw, HWND itself is not Send)
    host: isize,
    /// Video rect in physical pixels; None — whole client area
    rect: Mutex<Option<(i32, i32, i32, i32)>>,
}

unsafe extern "system" fn host_proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    if msg == WM_NCHITTEST {
        return LRESULT(HTTRANSPARENT as isize);
    }
    unsafe { DefWindowProcW(hwnd, msg, wp, lp) }
}

fn create_video_host(parent: HWND, width: i32, height: i32) -> windows::core::Result<HWND> {
    unsafe {
        let module = GetModuleHandleW(None)?;
        let instance = HINSTANCE(module.0);
        let class = w!("KinoVideoHost");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(host_proc),
            hInstance: instance,
            lpszClassName: class,
            hbrBackground: HBRUSH(GetStockObject(BLACK_BRUSH).0),
            ..Default::default()
        };
        RegisterClassW(&wc);
        let host = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class,
            w!("video"),
            // No WS_CLIPSIBLINGS: otherwise the WebView2 sibling above clips the video out
            // completely, transparent or not
            WS_CHILD | WS_VISIBLE | WS_DISABLED | WS_CLIPCHILDREN,
            0,
            0,
            width,
            height,
            Some(parent),
            None,
            Some(instance),
            None,
        )?;
        // Under the WebView2 child windows
        SetWindowPos(host, Some(HWND_BOTTOM), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)?;
        Ok(host)
    }
}

fn place_host(host: isize, x: i32, y: i32, w: i32, h: i32) {
    let host = HWND(host as *mut _);
    if let Err(e) = unsafe { SetWindowPos(host, Some(HWND_BOTTOM), x, y, w, h, SWP_NOACTIVATE) } {
        eprintln!("[spike] SetWindowPos: {e}");
    }
}

fn init_mpv(host: HWND) -> libmpv2::Result<Mpv> {
    let log = std::env::temp_dir().join("kino-spike-mpv.log");
    Mpv::with_initializer(|init| {
        init.set_option("wid", host.0 as i64)?;
        init.set_option("vo", "gpu-next")?;
        init.set_option("gpu-api", "d3d11")?;
        init.set_option("hwdec", "auto-safe")?;
        init.set_option("keep-open", "yes")?;
        init.set_option("idle", "yes")?;
        init.set_option("force-window", "yes")?;
        init.set_option("input-default-bindings", "no")?;
        init.set_option("input-vo-keyboard", "no")?;
        init.set_option("osc", "no")?;
        init.set_option("log-file", log.to_string_lossy().as_ref())?;
        Ok(())
    })
}

#[derive(Serialize, Default)]
struct PlayerState {
    path: Option<String>,
    time: Option<f64>,
    duration: Option<f64>,
    pause: Option<bool>,
    width: Option<i64>,
    height: Option<i64>,
    fps: Option<f64>,
    vo: Option<String>,
    hwdec: Option<String>,
    dropped: Option<i64>,
}

#[tauri::command]
fn mpv_state(p: State<'_, Player>) -> PlayerState {
    let m = &p.mpv;
    PlayerState {
        path: m.get_property::<String>("path").ok(),
        time: m.get_property::<f64>("time-pos").ok(),
        duration: m.get_property::<f64>("duration").ok(),
        pause: m.get_property::<bool>("pause").ok(),
        width: m.get_property::<i64>("width").ok(),
        height: m.get_property::<i64>("height").ok(),
        fps: m.get_property::<f64>("estimated-vf-fps").ok(),
        vo: m.get_property::<String>("current-vo").ok(),
        hwdec: m.get_property::<String>("hwdec-current").ok(),
        dropped: m.get_property::<i64>("frame-drop-count").ok(),
    }
}

#[tauri::command]
fn mpv_command(p: State<'_, Player>, args: Vec<String>) -> Result<(), String> {
    let (name, rest) = args.split_first().ok_or("empty command")?;
    let rest: Vec<&str> = rest.iter().map(String::as_str).collect();
    p.mpv.command(name, &rest).map_err(|e| e.to_string())
}

#[tauri::command]
fn mpv_set(p: State<'_, Player>, name: String, value: Value) -> Result<(), String> {
    let r = match value {
        Value::Bool(b) => p.mpv.set_property(&name, b),
        // Integer properties (aid, sid) reject doubles
        Value::Number(n) if n.is_i64() => p.mpv.set_property(&name, n.as_i64().unwrap_or_default()),
        Value::Number(n) => p.mpv.set_property(&name, n.as_f64().unwrap_or_default()),
        Value::String(s) => p.mpv.set_property(&name, s.as_str()),
        other => return Err(format!("unsupported value {other}")),
    };
    r.map_err(|e| e.to_string())
}

/// Place the video in a part of the window (physical px) or back to the whole client area
#[tauri::command]
fn video_rect(app: tauri::AppHandle, p: State<'_, Player>, rect: Option<(i32, i32, i32, i32)>) {
    *p.rect.lock().unwrap() = rect;
    let (x, y, w, h) = rect.unwrap_or_else(|| client_rect(&app));
    place_host(p.host, x, y, w, h);
}

#[tauri::command]
fn video_visible(p: State<'_, Player>, visible: bool) {
    let host = HWND(p.host as *mut _);
    let _ = unsafe { ShowWindow(host, if visible { SW_SHOWNA } else { SW_HIDE }) };
}

fn client_rect(app: &tauri::AppHandle) -> (i32, i32, i32, i32) {
    let size = app
        .get_webview_window("main")
        .and_then(|w| w.inner_size().ok())
        .map(|s| (s.width as i32, s.height as i32))
        .unwrap_or((1280, 760));
    (0, 0, size.0, size.1)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let win = app.get_webview_window("main").expect("main window");
            let parent = HWND(win.hwnd()?.0 as *mut _);
            let size = win.inner_size()?;
            let host = create_video_host(parent, size.width as i32, size.height as i32)?;
            let mpv = init_mpv(host).map_err(|e| format!("mpv init: {e}"))?;
            let start = std::env::args()
                .nth(1)
                .unwrap_or_else(|| "av://lavfi:testsrc2=size=1920x1080:rate=60".into());
            if let Err(e) = mpv.command("loadfile", &[&start]) {
                eprintln!("[spike] loadfile: {e}");
            }
            app.manage(Player { mpv, host: host.0 as isize, rect: Mutex::new(None) });
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::Resized(size) => {
                let p = window.state::<Player>();
                if p.rect.lock().unwrap().is_none() {
                    place_host(p.host, 0, 0, size.width as i32, size.height as i32);
                }
            }
            WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                if let Some(path) = paths.first() {
                    let p = window.state::<Player>();
                    if let Err(e) = p.mpv.command("loadfile", &[&path.to_string_lossy()]) {
                        eprintln!("[spike] loadfile: {e}");
                    }
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![mpv_state, mpv_command, mpv_set, video_rect, video_visible])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
