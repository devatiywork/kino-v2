//! What a navigation of the trackers browser becomes (SPEC 4.5): any web page opens inside Kino,
//! magnet links go to the add dialog, and Kino's own pages are never reachable from there.
//! Pure, so every rule is tested.

use std::path::Path;

use tauri::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Navigation {
    /// A web page: it opens inside Kino, whatever site it is
    Allow,
    /// A magnet link: the add dialog
    Magnet,
    /// Kino's own pages and whatever is not the web
    Block,
}

/// Kino's own pages: the app (tauri.localhost or the dev server) and its protocols (asset.localhost…)
fn is_app_url(url: &Url, app_origins: &[Url]) -> bool {
    let host = url.host_str().unwrap_or_default().to_lowercase();
    host == "localhost" || host.ends_with(".localhost") || app_origins.iter().any(|app| app.origin() == url.origin())
}

pub fn classify(target: &Url, app_origins: &[Url]) -> Navigation {
    match target.scheme() {
        "magnet" => Navigation::Magnet,
        "about" | "blob" => Navigation::Allow,
        "http" | "https" if !is_app_url(target, app_origins) => Navigation::Allow,
        _ => Navigation::Block,
    }
}

/// A download that is a torrent: by the name the site gives it or by the link
pub fn is_torrent_download(url: &Url, destination: &Path) -> bool {
    let named = |name: &str| name.to_lowercase().ends_with(".torrent");
    destination.file_name().and_then(|n| n.to_str()).is_some_and(named) || named(url.path())
}

/// What a download of the trackers browser is, before it starts
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DownloadKind {
    /// Named a .torrent, by the site or by the link
    Torrent,
    /// The name tells nothing (dl.php, «download»): what comes decides
    Unknown,
    /// Plainly something else (setup.exe, film.mkv): never downloaded here
    Other(String),
}

/// Pages that hand out files: their name says nothing of what comes
const SCRIPT_EXTENSIONS: [&str; 9] = ["php", "asp", "aspx", "jsp", "cgi", "pl", "py", "do", "action"];

pub fn download_kind(url: &Url, destination: &Path) -> DownloadKind {
    if is_torrent_download(url, destination) {
        return DownloadKind::Torrent;
    }
    let name = destination.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    match Path::new(name).extension().and_then(|e| e.to_str()).map(str::to_lowercase) {
        None => DownloadKind::Unknown,
        Some(extension) if SCRIPT_EXTENSIONS.contains(&extension.as_str()) => DownloadKind::Unknown,
        Some(_) => DownloadKind::Other(name.to_string()),
    }
}

/// A .torrent is a few megabytes at most; anything bigger is not one
pub const TORRENT_MAX_BYTES: u64 = 32 * 1024 * 1024;

/// The content is a .torrent: a bencoded description with a valid «info»
pub fn is_torrent_file(bytes: &[u8]) -> bool {
    bytes.len() as u64 <= TORRENT_MAX_BYTES && librqbit::torrent_from_bytes(bytes).is_ok_and(|torrent| torrent.info.data.validate().is_ok())
}

/// A bookmark's address: «rutracker.org» → «https://rutracker.org/»; only the web
pub fn normalize_url(input: &str) -> Option<Url> {
    let input = input.trim();
    if input.is_empty() {
        return None;
    }
    let with_scheme = if input.contains("://") { input.to_string() } else { format!("https://{input}") };
    let url = Url::parse(&with_scheme).ok()?;
    (matches!(url.scheme(), "http" | "https") && url.host_str().is_some()).then_some(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn navigations() {
        let apps = [url("http://127.0.0.1:5181/")];
        let go = |target: &str| classify(&url(target), &apps);
        assert_eq!(go("https://rutracker.org/forum/viewtopic.php?t=6612345"), Navigation::Allow);
        // Another site stays inside too: nothing goes to the default browser by itself
        assert_eq!(go("https://www.imdb.com/title/tt1"), Navigation::Allow);
        assert_eq!(go("http://127.0.0.2:9/elsewhere"), Navigation::Allow);
        assert_eq!(go("magnet:?xt=urn:btih:abc"), Navigation::Magnet);
        assert_eq!(go("about:blank"), Navigation::Allow);
        // Kino itself and anything that is not the web stay out of reach
        assert_eq!(go("http://tauri.localhost/"), Navigation::Block);
        assert_eq!(go("http://asset.localhost/C:/Users"), Navigation::Block);
        assert_eq!(go("http://localhost:3000/"), Navigation::Block);
        assert_eq!(go("http://127.0.0.1:5181/"), Navigation::Block);
        assert_eq!(go("file:///C:/Windows/win.ini"), Navigation::Block);
        assert_eq!(go("javascript:alert(1)"), Navigation::Block);
        assert_eq!(go("ms-settings:privacy"), Navigation::Block);
    }

    #[test]
    fn a_download_is_a_torrent_unknown_or_plainly_something_else() {
        let page = url("https://rutracker.org/forum/dl.php?t=1");
        assert_eq!(download_kind(&page, Path::new(r"C:\x\[rutracker.org].t1.torrent")), DownloadKind::Torrent);
        assert_eq!(download_kind(&page, Path::new(r"C:\x\dl.php")), DownloadKind::Unknown);
        assert_eq!(download_kind(&url("https://x.org/get/1"), Path::new(r"C:\x\download")), DownloadKind::Unknown);
        assert_eq!(download_kind(&page, Path::new(r"C:\x\Setup.EXE")), DownloadKind::Other("Setup.EXE".into()));
        assert_eq!(download_kind(&page, Path::new(r"C:\x\film.mkv")), DownloadKind::Other("film.mkv".into()));
    }

    #[test]
    fn only_a_real_torrent_counts_whatever_its_name() {
        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        let dir = std::env::temp_dir().join(format!("kino-sniff-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.bin");
        std::fs::write(&file, vec![1u8; 20_000]).unwrap();
        let made = runtime.block_on(async {
            let spawner = librqbit::spawn_utils::BlockingSpawner::new(1);
            librqbit::create_torrent(&file, Default::default(), &spawner).await.unwrap()
        });
        assert!(is_torrent_file(&made.as_bytes().unwrap()));
        assert!(!is_torrent_file(b"MZ\x90\x00 this is a program"));
        assert!(!is_torrent_file(b"<html>Login required</html>"));
        assert!(!is_torrent_file(b"d3:foo3:bare"), "bencode without info");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn torrent_downloads_by_name_or_link() {
        let dl = url("https://rutracker.org/forum/dl.php?t=6612345");
        assert!(is_torrent_download(&dl, Path::new(r"C:\Users\x\Downloads\[rutracker.org].t6612345.torrent")));
        assert!(is_torrent_download(&url("https://rutor.info/download/1001.TORRENT"), Path::new(r"C:\x\download")));
        assert!(!is_torrent_download(&dl, Path::new(r"C:\x\setup.exe")));
    }

    #[test]
    fn bookmark_addresses() {
        assert_eq!(normalize_url("rutracker.org").unwrap().as_str(), "https://rutracker.org/");
        assert_eq!(normalize_url(" http://rutor.info/top ").unwrap().as_str(), "http://rutor.info/top");
        assert_eq!(normalize_url("ftp://files.example.org"), None);
        assert_eq!(normalize_url(""), None);
    }
}
