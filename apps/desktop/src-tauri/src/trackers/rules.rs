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
