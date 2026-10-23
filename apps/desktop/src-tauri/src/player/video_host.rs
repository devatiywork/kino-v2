//! Child window that mpv renders into. It sits at the bottom of the z-order, under the
//! transparent WebView2, so the page draws the player UI on top of the video.
//! Recipe and the failed variants: spikes/tauri-mpv/README.md

use windows::core::w;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetStockObject, BLACK_BRUSH, HBRUSH};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, RegisterClassW, SetWindowPos, ShowWindow, HTTRANSPARENT,
    HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNA, WINDOW_EX_STYLE,
    WM_NCHITTEST, WNDCLASSW, WS_CHILD, WS_CLIPCHILDREN, WS_DISABLED,
};

pub struct VideoHost {
    /// HWND as a number: HWND itself is not Send
    hwnd: isize,
}

unsafe extern "system" fn host_proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    // Input always goes to the WebView2 above
    if msg == WM_NCHITTEST {
        return LRESULT(HTTRANSPARENT as isize);
    }
    unsafe { DefWindowProcW(hwnd, msg, wp, lp) }
}

impl VideoHost {
    /// Hidden until the player screen asks for it
    pub fn create(parent: isize, width: i32, height: i32) -> windows::core::Result<Self> {
        unsafe {
            let instance = HINSTANCE(GetModuleHandleW(None)?.0);
            let class = w!("KinoVideoHost");
            let wc = WNDCLASSW {
                lpfnWndProc: Some(host_proc),
                hInstance: instance,
                lpszClassName: class,
                hbrBackground: HBRUSH(GetStockObject(BLACK_BRUSH).0),
                ..Default::default()
            };
            RegisterClassW(&wc);
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                class,
                w!("video"),
                // No WS_CLIPSIBLINGS: the WebView2 sibling above would clip the video out completely
                WS_CHILD | WS_DISABLED | WS_CLIPCHILDREN,
                0,
                0,
                width,
                height,
                Some(HWND(parent as *mut _)),
                None,
                Some(instance),
                None,
            )?;
            SetWindowPos(hwnd, Some(HWND_BOTTOM), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)?;
            Ok(Self { hwnd: hwnd.0 as isize })
        }
    }

    /// Value for mpv's `wid` option
    pub fn wid(&self) -> i64 {
        self.hwnd as i64
    }

    fn hwnd(&self) -> HWND {
        HWND(self.hwnd as *mut _)
    }

    /// Fill the client area (physical pixels), staying under the WebView2
    pub fn resize(&self, width: i32, height: i32) {
        let r = unsafe { SetWindowPos(self.hwnd(), Some(HWND_BOTTOM), 0, 0, width, height, SWP_NOACTIVATE) };
        if let Err(e) = r {
            eprintln!("[player] resize video host: {e}");
        }
    }

    pub fn set_visible(&self, visible: bool) {
        // Return value is the previous visibility, not an error
        let _ = unsafe { ShowWindow(self.hwnd(), if visible { SW_SHOWNA } else { SW_HIDE }) };
    }
}
