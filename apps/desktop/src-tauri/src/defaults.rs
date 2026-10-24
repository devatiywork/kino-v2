//! SPEC 4.1, 6: «Kino как обработчик .torrent и magnet:», «открывать видео через Kino». The
//! installer registers Kino for them; which program Windows uses is the user's choice in its
//! «Приложения по умолчанию», which a program may not make for them. Kino only reads what Windows
//! uses now and opens that page.

use serde::Serialize;
use windows::core::{HSTRING, PCWSTR, PWSTR};
use windows::Win32::UI::Shell::{AssocQueryStringW, ASSOCF, ASSOCF_IS_PROTOCOL, ASSOCF_NONE, ASSOCF_NOTRUNCATE, ASSOCSTR, ASSOCSTR_EXECUTABLE, ASSOCSTR_FRIENDLYAPPNAME};

use crate::error::AppResult;

/// What opens a kind of thing now
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Handler {
    /// «Kino», «qBittorrent», «Кино и ТВ»; None — nothing opens it
    pub name: Option<String>,
    /// It is this Kino
    pub is_kino: bool,
}

/// Video files, .torrent files, magnet links
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultHandlers {
    pub video: Handler,
    pub torrent: Handler,
    pub magnet: Handler,
}

fn query(what: &str, protocol: bool, kind: ASSOCSTR) -> Option<String> {
    let flags = ASSOCF(ASSOCF_NOTRUNCATE.0 | if protocol { ASSOCF_IS_PROTOCOL.0 } else { ASSOCF_NONE.0 });
    let what = HSTRING::from(what);
    let mut buffer = vec![0u16; 1024];
    let mut length = buffer.len() as u32;
    // SAFETY: the buffer and its length go together; Windows writes at most `length` units
    let found = unsafe { AssocQueryStringW(flags, kind, &what, PCWSTR::null(), Some(PWSTR(buffer.as_mut_ptr())), &mut length) };
    if found.is_err() || length == 0 {
        return None;
    }
    let text = String::from_utf16_lossy(&buffer[..length as usize - 1]);
    (!text.trim().is_empty()).then_some(text)
}

/// The same program file, whatever the case and the slashes
pub fn same_program(a: &str, b: &std::path::Path) -> bool {
    let normalize = |path: &str| path.replace('/', "\\").trim_matches('"').to_lowercase();
    normalize(a) == normalize(&b.to_string_lossy())
}

fn handler(what: &str, protocol: bool) -> Handler {
    let Some(exe) = query(what, protocol, ASSOCSTR_EXECUTABLE) else { return Handler { name: None, is_kino: false } };
    // Nothing chosen: Windows answers with its «Выбор приложения»
    let file = std::path::Path::new(exe.trim_matches('"')).file_name().map(|f| f.to_string_lossy().to_lowercase());
    if file.as_deref() == Some("openwith.exe") {
        return Handler { name: None, is_kino: false };
    }
    let is_kino = std::env::current_exe().is_ok_and(|me| same_program(&exe, &me));
    Handler { name: query(what, protocol, ASSOCSTR_FRIENDLYAPPNAME), is_kino }
}

#[tauri::command]
pub fn app_default_handlers() -> DefaultHandlers {
    DefaultHandlers { video: handler(".mkv", false), torrent: handler(".torrent", false), magnet: handler("magnet", true) }
}

/// «Приложения по умолчанию» of Windows, at Kino's own page when the installer registered it
/// (as KinoV2 — windows/hooks.nsh)
#[tauri::command]
pub fn app_open_default_apps() -> AppResult<()> {
    std::process::Command::new("explorer").arg("ms-settings:defaultapps?registeredAppUser=KinoV2").spawn()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_program_is_the_same_whatever_its_spelling() {
        assert!(same_program(r#""C:\Program Files\Kino\kino-desktop.exe""#, std::path::Path::new("c:/program files/kino/KINO-DESKTOP.exe")));
        assert!(!same_program(r"C:\qBittorrent\qbittorrent.exe", std::path::Path::new(r"C:\Program Files\Kino\kino-desktop.exe")));
    }

    #[test]
    fn windows_answers_for_a_known_kind_of_file() {
        // .txt has a handler on any Windows; a made-up extension has none
        assert!(query(".txt", false, ASSOCSTR_EXECUTABLE).is_some());
        assert_eq!(handler(".kino-no-such-extension", false), Handler { name: None, is_kino: false });
    }
}
