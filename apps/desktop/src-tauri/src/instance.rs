//! SPEC 6 «Одно окно»: one Kino per data folder. A second start hands what it was started with
//! (a video, a .torrent, a magnet link — or nothing) to the running Kino and quits; the running
//! one shows its window and opens it. Keyed by the data folder, so the tests' and a debug build's
//! Kinos never meet the user's one, while two Kinos never share one database.

use std::path::Path;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::DataExchange::COPYDATASTRUCT;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::CreateMutexW;
use windows::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, CreateWindowExW, DefWindowProcW, DispatchMessageW, FindWindowExW, GetMessageW, GetWindowThreadProcessId,
    RegisterClassW, SendMessageTimeoutW, HWND_MESSAGE, MSG, SMTO_ABORTIFHUNG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_COPYDATA, WNDCLASSW,
};

/// Our WM_COPYDATA among any others: «KINO»
const KINO_ARGS: usize = 0x4B49_4E4F;
/// The running Kino may still be starting: its window comes a moment after its mutex
const FIND_FOR: Duration = Duration::from_secs(10);

/// What a start of Kino is
pub enum Instance {
    /// The only one for its data folder: `listen` takes what later starts hand over
    First(Listener),
    /// Another Kino has this data folder: what this start was given went to it
    Handed,
}

/// The first Kino's claim. Its mutex is never closed: it lives as long as the process
pub struct Listener {
    key: String,
}

/// The name of the mutex and the message window: FNV-1a of the lower-cased folder (stable across
/// builds, unlike the standard hasher)
pub fn key_of(data_dir: &Path) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in data_dir.to_string_lossy().to_lowercase().trim_end_matches(['\\', '/']).bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("Kino-{hash:016x}")
}

/// The arguments as one block: each followed by NUL
pub fn pack(args: &[String]) -> Vec<u16> {
    args.iter().flat_map(|arg| arg.encode_utf16().chain(std::iter::once(0))).collect()
}

pub fn unpack(block: &[u16]) -> Vec<String> {
    block.split(|unit| *unit == 0).filter(|arg| !arg.is_empty()).map(String::from_utf16_lossy).collect()
}

/// Takes the data folder or hands `args` to the Kino that has it
pub fn claim(data_dir: &Path, args: &[String]) -> Instance {
    let key = key_of(data_dir);
    // SAFETY: a named mutex, left open for the life of the process
    match unsafe { CreateMutexW(None, false, &HSTRING::from(format!("Local\\{key}"))) } {
        Ok(_) if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS => return hand_over(&key, args),
        Ok(_) => {}
        // No mutex — no single instance, but Kino still works
        Err(e) => eprintln!("[instance] mutex: {e}"),
    }
    Instance::First(Listener { key })
}

fn hand_over(key: &str, args: &[String]) -> Instance {
    let class = HSTRING::from(key);
    let deadline = Instant::now() + FIND_FOR;
    let window = loop {
        // SAFETY: a lookup among the message-only windows
        match unsafe { FindWindowExW(Some(HWND_MESSAGE), None, &class, PCWSTR::null()) } {
            Ok(window) if !window.is_invalid() => break Some(window),
            _ if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(100)),
            _ => break None,
        }
    };
    let Some(window) = window else {
        eprintln!("[instance] another Kino has this data folder but does not answer");
        return Instance::Handed;
    };
    let mut block = pack(args);
    let data = COPYDATASTRUCT { dwData: KINO_ARGS, cbData: (block.len() * 2) as u32, lpData: block.as_mut_ptr().cast() };
    // SAFETY: the window belongs to the other Kino; `data` outlives the synchronous send
    unsafe {
        let mut pid = 0;
        GetWindowThreadProcessId(window, Some(&mut pid));
        // This start has the foreground (the user just did it): the other Kino may take it
        let _ = AllowSetForegroundWindow(pid);
        let mut result = 0;
        SendMessageTimeoutW(window, WM_COPYDATA, WPARAM(0), LPARAM(&data as *const COPYDATASTRUCT as isize), SMTO_ABORTIFHUNG, 5_000, Some(&mut result));
    }
    Instance::Handed
}

type OnArgs = Box<dyn Fn(Vec<String>) + Send + Sync>;
static ON_ARGS: OnceLock<OnArgs> = OnceLock::new();

impl Listener {
    /// From now on what later starts hand over goes to `on_args` (on a thread of its own)
    pub fn listen(self, on_args: impl Fn(Vec<String>) + Send + Sync + 'static) {
        if ON_ARGS.set(Box::new(on_args)).is_err() {
            return;
        }
        let spawned = std::thread::Builder::new().name("instance".into()).spawn(move || {
            if let Err(e) = message_loop(&self.key) {
                eprintln!("[instance] window: {e}");
            }
        });
        if let Err(e) = spawned {
            eprintln!("[instance] thread: {e}");
        }
    }
}

fn message_loop(key: &str) -> windows::core::Result<()> {
    let class = HSTRING::from(key);
    // SAFETY: a message-only window of this thread with its own class; the loop runs until the
    // process ends
    unsafe {
        let instance = GetModuleHandleW(None)?;
        let wc = WNDCLASSW { lpfnWndProc: Some(window_proc), hInstance: instance.into(), lpszClassName: PCWSTR(class.as_ptr()), ..Default::default() };
        if RegisterClassW(&wc) == 0 {
            return Err(windows::core::Error::from_win32());
        }
        CreateWindowExW(WINDOW_EX_STYLE(0), &class, &class, WINDOW_STYLE(0), 0, 0, 0, 0, Some(HWND_MESSAGE), None, Some(instance.into()), None)?;
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            DispatchMessageW(&msg);
        }
    }
    Ok(())
}

extern "system" fn window_proc(window: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if message == WM_COPYDATA {
        // SAFETY: for WM_COPYDATA lparam points to a COPYDATASTRUCT valid during the call
        let data = unsafe { &*(lparam.0 as *const COPYDATASTRUCT) };
        if data.dwData == KINO_ARGS {
            let units = (data.cbData / 2) as usize;
            let block = if units == 0 { &[][..] } else { unsafe { std::slice::from_raw_parts(data.lpData as *const u16, units) } };
            if let Some(on_args) = ON_ARGS.get() {
                on_args(unpack(block));
            }
            return LRESULT(1);
        }
    }
    // SAFETY: everything else as Windows does it
    unsafe { DefWindowProcW(window, message, wparam, lparam) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_key_per_data_folder_whatever_its_spelling() {
        let key = key_of(Path::new(r"C:\Users\me\AppData\Roaming\local.kino.app"));
        assert_eq!(key, key_of(Path::new(r"c:\users\me\appdata\roaming\LOCAL.KINO.APP\")));
        assert_ne!(key, key_of(Path::new(r"C:\Temp\kino-e2e-1")));
        assert!(key.starts_with("Kino-") && key.len() == 21);
    }

    #[test]
    fn the_arguments_survive_the_trip() {
        let args = vec![r"D:\Сериалы\Shōgun S01E01.mkv".to_string(), "magnet:?xt=urn:btih:abc&dn=a b".to_string()];
        assert_eq!(unpack(&pack(&args)), args);
        assert!(unpack(&pack(&[])).is_empty());
    }

    #[test]
    fn a_second_start_hands_its_files_to_the_first() {
        let dir = std::env::temp_dir().join(format!("kino-instance-{}", std::process::id()));
        let Instance::First(listener) = claim(&dir, &[]) else { panic!("the first one") };
        let (sender, receiver) = std::sync::mpsc::channel();
        let sender = std::sync::Mutex::new(sender);
        listener.listen(move |args| sender.lock().unwrap().send(args).unwrap());
        let given = vec![r"C:\Видео\Film.mkv".to_string()];
        assert!(matches!(claim(&dir, &given), Instance::Handed));
        assert_eq!(receiver.recv_timeout(Duration::from_secs(5)).unwrap(), given);
        assert!(matches!(claim(&dir.join("other"), &[]), Instance::First(_)), "another data folder — another Kino");
    }
}
