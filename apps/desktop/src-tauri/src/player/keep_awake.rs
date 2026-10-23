//! SPEC 6 «Не давать компьютеру засыпать»: a Windows power request while a video plays.
//! Unlike SetThreadExecutionState it belongs to no thread, so any thread may switch it.

use std::sync::Mutex;

use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Power::{
    PowerClearRequest, PowerCreateRequest, PowerRequestDisplayRequired, PowerRequestSystemRequired, PowerSetRequest,
    POWER_REQUEST_TYPE,
};
use windows::Win32::System::Threading::{POWER_REQUEST_CONTEXT_SIMPLE_STRING, REASON_CONTEXT, REASON_CONTEXT_0};

/// The screen stays on and the computer does not sleep
const KINDS: [POWER_REQUEST_TYPE; 2] = [PowerRequestDisplayRequired, PowerRequestSystemRequired];

pub struct KeepAwake {
    /// The request handle as a number (HANDLE is not Send); None — Windows refused one
    request: Option<isize>,
    active: Mutex<bool>,
}

impl KeepAwake {
    pub fn new() -> Self {
        // `powercfg /requests` shows this reason
        let mut reason: Vec<u16> = "Kino: video is playing".encode_utf16().chain([0]).collect();
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
        Self { request, active: Mutex::new(false) }
    }

    /// On while a video plays (and the setting allows it), off otherwise; repeats are free
    pub fn set(&self, on: bool) {
        let Some(request) = self.request else { return };
        let mut active = self.active.lock().unwrap_or_else(|p| p.into_inner());
        if *active == on {
            return;
        }
        let handle = HANDLE(request as *mut _);
        for kind in KINDS {
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
