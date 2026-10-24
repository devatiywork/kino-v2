//! Tauri commands of the trackers browser; the renderer calls them through src/shared/ipc/trackers.ts

use std::sync::Arc;

use tauri::State;

use super::rules::normalize_url;
use super::store::Bookmark;
use super::{Bounds, PageState, Trackers};
use crate::error::{AppError, AppResult};

type Service<'a> = State<'a, Arc<Trackers>>;

fn web_link(url: &str) -> AppResult<tauri::Url> {
    normalize_url(url).ok_or_else(|| AppError::NotAWebLink(url.to_string()))
}

/// No title — the site's name
fn title_of(title: &str, url: &tauri::Url) -> String {
    let title = title.trim();
    if title.is_empty() {
        url.host_str().unwrap_or_default().trim_start_matches("www.").to_string()
    } else {
        title.to_string()
    }
}

/// Whether the trackers browser offers to save passwords now; null — it is not open yet
#[tauri::command]
pub async fn tracker_password_saving(trackers: Service<'_>) -> AppResult<Option<bool>> {
    trackers.password_saving().await
}

/// «Удалить сохранённые пароли» of every site
#[tauri::command]
pub async fn tracker_clear_passwords(trackers: Service<'_>) -> AppResult<()> {
    trackers.clear_passwords().await
}

#[tauri::command]
pub fn tracker_bookmarks(trackers: Service<'_>) -> AppResult<Vec<Bookmark>> {
    Ok(trackers.store().list()?)
}

#[tauri::command]
pub fn tracker_bookmark_create(trackers: Service<'_>, title: String, url: String) -> AppResult<Bookmark> {
    let url = web_link(&url)?;
    Ok(trackers.store().create(&title_of(&title, &url), url.as_str())?)
}

#[tauri::command]
pub fn tracker_bookmark_update(trackers: Service<'_>, id: i64, title: String, url: String) -> AppResult<()> {
    let url = web_link(&url)?;
    Ok(trackers.store().update(id, &title_of(&title, &url), url.as_str())?)
}

#[tauri::command]
pub fn tracker_bookmark_delete(trackers: Service<'_>, id: i64) -> AppResult<()> {
    Ok(trackers.store().delete(id)?)
}

/// −1 — one place up, +1 — down
#[tauri::command]
pub fn tracker_bookmark_move(trackers: Service<'_>, id: i64, step: i32) -> AppResult<()> {
    Ok(trackers.store().shift(id, step.signum())?)
}

/// Opens a site in the trackers browser over the tab (async: making a webview waits for the main thread)
#[tauri::command]
pub async fn tracker_open(trackers: Service<'_>, url: String, bounds: Bounds) -> AppResult<()> {
    trackers.open(web_link(&url)?, bounds)
}

/// Where the page lies, or null — hidden (another screen, a dialog over the tab)
#[tauri::command]
pub async fn tracker_layout(trackers: Service<'_>, bounds: Option<Bounds>) -> AppResult<()> {
    trackers.layout(bounds)
}

/// "back", "forward" or "reload"
#[tauri::command]
pub async fn tracker_go(trackers: Service<'_>, action: String) -> AppResult<()> {
    trackers.go(&action)
}

#[tauri::command]
pub fn tracker_page(trackers: Service<'_>) -> PageState {
    trackers.page()
}
