//! SPEC 6 «Не давать компьютеру засыпать»: a Windows power request — while a video plays (the
//! screen too) or while torrents download (only the computer). Unlike SetThreadExecutionState it
//! belongs to no thread, so any thread may switch it.

use std::sync::Mutex;

use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Power::{
    PowerClearRequest, PowerCreateRequest, PowerRequestDisplayRequired, PowerRequestSystemRequired, PowerSetRequest,
    POWER_REQUEST_TYPE,
};
use windows::Win32::System::Threading::{POWER_REQUEST_CONTEXT_SIMPLE_STRING, REASON_CONTEXT, REASON_CONTEXT_0};

/// The screen stays on and the computer does not sleep
const SCREEN_AND_SYSTEM: &[POWER_REQUEST_TYPE] = &[PowerRequestDisplayRequired, PowerRequestSystemRequired];
/// Only the computer: the screen may go off
const SYSTEM: &[POWER_REQUEST_TYPE] = &[PowerRequestSystemRequired];

pub struct KeepAwake {
    /// The request handle as a number (HANDLE is not Send); None — Windows refused one
    request: Option<isize>,
    kinds: &'static [POWER_REQUEST_TYPE],
    active: Mutex<bool>,
}

impl KeepAwake {
    /// A video: the screen stays on
    pub fn for_video() -> Self {
        Self::new("Kino: video is playing", SCREEN_AND_SYSTEM)
    }

    /// Downloads: the computer stays on, the screen may go off
    pub fn for_downloads() -> Self {
        Self::new("Kino: torrents are downloading", SYSTEM)
    }

    fn new(reason: &str, kinds: &'static [POWER_REQUEST_TYPE]) -> Self {
        // `powercfg /requests` shows this reason
        let mut reason: Vec<u16> = reason.encode_utf16().chain([0]).collect();
        let context = REASON_CONTEXT {
            // POWER_REQUEST_CONTEXT_VERSION
            Version: 0,
            Flags: POWER_REQUEST_CONTEXT_SIMPLE_STRING,
            Reason: REASON_CONTEXT_0 { SimpleReasonString: PWSTR(reason.as_mut_ptr()) },
        };
        let request = match unsafe { PowerCreateRequest(&context) } {
            Ok(handle) => Some(handle.0 as isize),
            Err(e) => {
                eprintln!("[power] request: {e}");
                None
            }
        };
        Self { request, kinds, active: Mutex::new(false) }
    }

    /// On while the reason lasts (and the setting allows it), off otherwise; repeats are free
    pub fn set(&self, on: bool) {
        let Some(request) = self.request else { return };
        let mut active = self.active.lock().unwrap_or_else(|p| p.into_inner());
        if *active == on {
            return;
        }
        let handle = HANDLE(request as *mut _);
        for &kind in self.kinds {
            let result = unsafe { if on { PowerSetRequest(handle, kind) } else { PowerClearRequest(handle, kind) } };
            if let Err(e) = result {
                eprintln!("[power] {} request {}: {e}", if on { "set" } else { "clear" }, kind.0);
            }
        }
        *active = on;
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        if let Some(request) = self.request {
            if let Err(e) = unsafe { CloseHandle(HANDLE(request as *mut _)) } {
                eprintln!("[power] close: {e}");
            }
        }
    }
}
