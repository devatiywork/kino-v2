//! Folders and files in Explorer through the shell itself, never explorer.exe's command line.
//! Its own parser takes what std::process makes of a path with a space — `"/select,C:\a b"` — or
//! of a folder ending in `\` — `"D:\Сериалы\\"` — for nothing and opens «Документы» instead

use std::path::Path;

use windows::core::{w, HSTRING, PCWSTR};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, IBindCtx, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{ILFree, SHOpenFolderAndSelectItems, SHParseDisplayName, ShellExecuteW};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

/// A folder in an Explorer window of its own
pub fn open_folder(dir: &Path) -> windows::core::Result<()> {
    let dir = HSTRING::from(dir.as_os_str());
    // SAFETY: plain strings that live through the call
    let done = unsafe { ShellExecuteW(None, w!("open"), &dir, PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
    // ShellExecute's own convention: more than 32 — done
    if done.0 as isize > 32 {
        Ok(())
    } else {
        Err(windows::core::Error::from_win32())
    }
}

/// The folder of `item` with it selected (a torrent's content: a file or its folder)
pub fn reveal(item: &Path) -> windows::core::Result<()> {
    let item = HSTRING::from(item.as_os_str());
    // A thread of its own with COM in the shell's apartment: Tauri's threads may have another one
    std::thread::spawn(move || {
        // SAFETY: COM is set up and torn down on this thread; the item list is freed after use
        unsafe {
            let com = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let mut pidl = std::ptr::null_mut();
            let result = SHParseDisplayName(&item, None::<&IBindCtx>, &mut pidl, 0, None).and_then(|()| {
                // No items: `pidl` is the item itself, its folder opens with it selected
                let shown = SHOpenFolderAndSelectItems(pidl, None, 0);
                ILFree(Some(pidl));
                shown
            });
            if com.is_ok() {
                CoUninitialize();
            }
            result
        }
    })
    .join()
    .unwrap_or_else(|_| Err(windows::core::Error::from_hresult(windows::Win32::Foundation::E_UNEXPECTED)))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Opens real Explorer windows: run by hand (`cargo test shell -- --ignored`), look, close them
    #[test]
    #[ignore]
    fn explorer_opens_where_asked_whatever_the_path() {
        let dir = std::env::temp_dir().join("kino-shell (test) Сериал s05");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("The Walking Dead s05e01 [LF].mkv");
        std::fs::write(&file, b"").unwrap();
        reveal(&file).unwrap();
        open_folder(&dir).unwrap();
        open_folder(Path::new(&format!("{}\\", dir.display()))).unwrap();
    }
}
