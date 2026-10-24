//! SPEC 6 «Обновления», 4.7: only when the user turns it on, Kino asks GitHub Releases whether a
//! newer version is out — at start and once a day — and tells the user once per version; the
//! release page opens in the browser. Nothing is downloaded or installed by itself.

use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppResult;
use crate::library::Library;
use crate::settings::SettingsStore;

/// The project's releases. KINO_UPDATES_URL — another address (the tests' own server)
const LATEST: &str = "https://api.github.com/repos/devatiywork/kino-v2/releases/latest";
/// The check at start or of the day found a newer version: the renderer takes it
pub const UPDATE_EVENT: &str = "app://update";
/// The version the user was told about last: once per version
const NOTIFIED_KEY: &str = "updates.notified";
const FIRST_CHECK: Duration = Duration::from_secs(20);
const EVERY: Duration = Duration::from_secs(24 * 60 * 60);

/// A release of Kino on GitHub
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    /// «0.22.0»
    pub version: String,
    /// The release page: what is new and the installer
    pub url: String,
    pub notes: String,
}

/// The newer version not shown yet. The renderer takes it when it is up and on every
/// `app://update`: shown once, even if the check finished before the page listened
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Release>>);

/// What the check found
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub current: String,
    /// None — nothing is published yet (GitHub answers 404)
    pub latest: Option<Release>,
    /// The latest is newer than this Kino
    pub available: bool,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

/// «v1.2.3» / «1.2.3» → (1, 2, 3); anything else — None
pub fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    let core = text.trim().trim_start_matches(['v', 'V']).split(['-', '+']).next()?;
    let mut parts = core.split('.').map(|part| part.parse::<u64>().ok());
    let version = (parts.next()??, parts.next().unwrap_or(Some(0))?, parts.next().unwrap_or(Some(0))?);
    parts.next().is_none().then_some(version)
}

pub fn is_newer(latest: &str, current: &str) -> bool {
    matches!((parse_version(latest), parse_version(current)), (Some(latest), Some(current)) if latest > current)
}

fn release_of(json: &str) -> anyhow::Result<Release> {
    let release: GithubRelease = serde_json::from_str(json)?;
    anyhow::ensure!(!release.draft && !release.prerelease, "not a published release");
    anyhow::ensure!(parse_version(&release.tag_name).is_some(), "the tag {} is not a version", release.tag_name);
    Ok(Release {
        version: release.tag_name.trim_start_matches(['v', 'V']).to_string(),
        url: release.html_url,
        notes: release.body.unwrap_or_default(),
    })
}

/// Asks the releases address for the latest release
pub async fn check(url: &str, current: &str) -> anyhow::Result<UpdateCheck> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(15)).user_agent(format!("Kino/{current}")).build()?;
    let response = client.get(url).header("Accept", "application/vnd.github+json").send().await?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateCheck { current: current.to_string(), latest: None, available: false });
    }
    let latest = release_of(&response.error_for_status()?.text().await?)?;
    let available = is_newer(&latest.version, current);
    Ok(UpdateCheck { current: current.to_string(), latest: Some(latest), available })
}

fn latest_url() -> String {
    std::env::var("KINO_UPDATES_URL").unwrap_or_else(|_| LATEST.to_string())
}

/// «Проверить сейчас» in the settings
#[tauri::command]
pub async fn app_check_update(app: AppHandle) -> AppResult<UpdateCheck> {
    Ok(check(&latest_url(), &app.package_info().version.to_string()).await?)
}

/// The newer version to tell about, once
#[tauri::command]
pub fn app_take_update(pending: tauri::State<'_, PendingUpdate>) -> Option<Release> {
    pending.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).take()
}

/// While «Проверять обновления» is on: at start and once a day; a newer version is told once
pub fn spawn_checks(app: AppHandle, settings: std::sync::Arc<SettingsStore>) {
    tauri::async_runtime::spawn(async move {
        // The tests' own server answers at once
        let first = if std::env::var_os("KINO_UPDATES_URL").is_some() { Duration::from_secs(1) } else { FIRST_CHECK };
        tokio::time::sleep(first).await;
        loop {
            if settings.read(|s| s.check_updates) {
                let current = app.package_info().version.to_string();
                match check(&latest_url(), &current).await {
                    Ok(UpdateCheck { latest: Some(latest), available: true, .. }) => tell_once(&app, latest),
                    Ok(_) => {}
                    Err(e) => eprintln!("[updates] {e:#}"),
                }
            }
            tokio::time::sleep(EVERY).await;
        }
    });
}

fn tell_once(app: &AppHandle, release: Release) {
    let library = app.state::<std::sync::Arc<Library>>();
    if library.setting(NOTIFIED_KEY).ok().flatten().as_deref() == Some(release.version.as_str()) {
        return;
    }
    if let Err(e) = library.set_setting(NOTIFIED_KEY, &release.version) {
        eprintln!("[updates] remember: {e}");
    }
    *app.state::<PendingUpdate>().0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(release);
    if let Err(e) = app.emit(UPDATE_EVENT, ()) {
        eprintln!("[updates] emit: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare_as_numbers() {
        assert_eq!(parse_version("v0.22.0"), Some((0, 22, 0)));
        assert_eq!(parse_version("1.2"), Some((1, 2, 0)));
        assert_eq!(parse_version("1.2.3-beta.1"), Some((1, 2, 3)));
        assert_eq!(parse_version("nightly"), None);
        assert!(is_newer("v0.22.0", "0.21.0"));
        assert!(is_newer("0.100.0", "0.99.9"), "not as text");
        assert!(!is_newer("0.21.0", "0.21.0"));
        assert!(!is_newer("garbage", "0.21.0"));
    }

    #[test]
    fn a_github_release_is_read_drafts_are_not() {
        let json = r#"{"tag_name":"v0.22.0","html_url":"https://github.com/devatiywork/kino-v2/releases/tag/v0.22.0","body":"Что нового","draft":false,"prerelease":false,"assets":[]}"#;
        let release = release_of(json).unwrap();
        assert_eq!((release.version.as_str(), release.notes.as_str()), ("0.22.0", "Что нового"));
        assert!(release_of(&json.replace(r#""draft":false"#, r#""draft":true"#)).is_err());
    }

    #[test]
    fn nothing_published_yet_is_not_an_error() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/releases/latest", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let _ = stream.read(&mut [0u8; 2048]).unwrap();
            let body = r#"{"message":"Not Found"}"#;
            let reply = format!("HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            stream.write_all(reply.as_bytes()).unwrap();
        });
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let found = runtime.block_on(check(&url, "0.25.1")).unwrap();
        assert_eq!(found, UpdateCheck { current: "0.25.1".into(), latest: None, available: false });
        server.join().unwrap();
    }

    #[test]
    fn the_check_asks_the_releases_address() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/releases/latest", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 2048];
            let read = stream.read(&mut request).unwrap();
            let body = r#"{"tag_name":"v9.9.9","html_url":"https://example.org/r","body":null}"#;
            let reply = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            stream.write_all(reply.as_bytes()).unwrap();
            String::from_utf8_lossy(&request[..read]).to_string()
        });
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let found = runtime.block_on(check(&url, "0.21.0")).unwrap();
        assert_eq!(
            found,
            UpdateCheck { current: "0.21.0".into(), latest: Some(Release { version: "9.9.9".into(), url: "https://example.org/r".into(), notes: String::new() }), available: true }
        );
        let request = server.join().unwrap().to_lowercase();
        assert!(request.contains("user-agent: kino/0.21.0"), "GitHub wants a user agent: {request}");
    }
}
