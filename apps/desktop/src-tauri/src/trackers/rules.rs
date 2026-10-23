//! What a navigation of the trackers browser becomes (SPEC 4.5): the tracker's own pages open
//! inside Kino, magnet links go to the add dialog, other sites to the default browser, and
//! Kino's own pages are never reachable from there. Pure, so every rule is tested.

use std::path::Path;

use tauri::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Navigation {
    /// The same site: the page opens inside Kino
    Allow,
    /// A magnet link: the add dialog
    Magnet,
    /// Another site: the default browser
    External,
    /// Kino's own pages and whatever is not the web
    Block,
}

/// rutracker.org for bt.rutracker.org; three labels for `co.uk`-like zones; an IP or a
/// one-label host stays as it is
fn site_key(host: &str) -> String {
    if host.parse::<std::net::IpAddr>().is_ok() || !host.contains('.') {
        return host.to_string();
    }
    let labels: Vec<&str> = host.trim_end_matches('.').split('.').collect();
    let n = labels.len();
    let short_zone = n >= 3 && labels[n - 1].len() == 2 && labels[n - 2].len() <= 3;
    labels[n.saturating_sub(if short_zone { 3 } else { 2 })..].join(".").to_lowercase()
}

/// Hosts of one site: rutracker.org, www.rutracker.org, bt.rutracker.org
pub fn same_site(a: &Url, b: &Url) -> bool {
    match (a.host_str(), b.host_str()) {
        (Some(a), Some(b)) => site_key(a) == site_key(b),
        _ => false,
    }
}

/// Kino's own pages: the app (tauri.localhost or the dev server) and its protocols (asset.localhost…)
fn is_app_url(url: &Url, app_origins: &[Url]) -> bool {
    let host = url.host_str().unwrap_or_default().to_lowercase();
    host == "localhost" || host.ends_with(".localhost") || app_origins.iter().any(|app| app.origin() == url.origin())
}

/// `home` — the site the trackers browser was opened on (a bookmark or a typed address)
pub fn classify(home: Option<&Url>, target: &Url, app_origins: &[Url]) -> Navigation {
    match target.scheme() {
        "magnet" => return Navigation::Magnet,
        "about" | "blob" => return Navigation::Allow,
        "http" | "https" => {}
        _ => return Navigation::Block,
    }
    if is_app_url(target, app_origins) {
        return Navigation::Block;
    }
    match home {
        Some(home) if !same_site(home, target) => Navigation::External,
        _ => Navigation::Allow,
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
    fn subdomains_are_one_site() {
        assert!(same_site(&url("https://rutracker.org/forum/index.php"), &url("https://bt.rutracker.org/dl.php?t=1")));
        assert!(same_site(&url("https://rutor.info/"), &url("http://www.rutor.info/torrent/1")));
        assert!(!same_site(&url("https://rutor.info/"), &url("https://rutracker.org/")));
        assert!(same_site(&url("https://tracker.example.co.uk/"), &url("https://www.example.co.uk/")));
        assert!(!same_site(&url("https://a.co.uk/"), &url("https://b.co.uk/")));
        assert!(same_site(&url("http://127.0.0.1:8080/"), &url("http://127.0.0.1:8080/topic/1")));
        assert!(!same_site(&url("http://127.0.0.1:8080/"), &url("http://127.0.0.2:8080/")));
    }

    #[test]
    fn navigations() {
        let home = url("https://rutracker.org/forum/index.php");
        let apps = [url("http://127.0.0.1:5181/")];
        let go = |target: &str| classify(Some(&home), &url(target), &apps);
        assert_eq!(go("https://rutracker.org/forum/viewtopic.php?t=6612345"), Navigation::Allow);
        assert_eq!(go("magnet:?xt=urn:btih:abc"), Navigation::Magnet);
        assert_eq!(go("https://www.imdb.com/title/tt1"), Navigation::External);
        assert_eq!(go("about:blank"), Navigation::Allow);
        // Kino itself and anything that is not the web stay out of reach
        assert_eq!(go("http://tauri.localhost/"), Navigation::Block);
        assert_eq!(go("http://asset.localhost/C:/Users"), Navigation::Block);
        assert_eq!(go("http://127.0.0.1:5181/"), Navigation::Block);
        assert_eq!(go("file:///C:/Windows/win.ini"), Navigation::Block);
        assert_eq!(go("javascript:alert(1)"), Navigation::Block);
        // The first page opens whatever site it is
        assert_eq!(classify(None, &url("https://rutor.info/"), &apps), Navigation::Allow);
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
