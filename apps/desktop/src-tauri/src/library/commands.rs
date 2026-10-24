//! Tauri commands of the library; the renderer calls them through src/shared/ipc/library.ts

use std::path::Path;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::search::LibrarySearch;
use super::series::SeriesSummary;
use super::{Folder, HistoryEntry, Library, LibraryFile, SeriesDetail};
use crate::error::{AppError, AppResult};

pub const CHANGED_EVENT: &str = "library://changed";

#[tauri::command]
pub fn library_continue_watching(library: State<'_, Arc<Library>>, limit: u32) -> AppResult<Vec<LibraryFile>> {
    Ok(library.continue_watching(limit)?)
}

#[tauri::command]
pub fn library_history(library: State<'_, Arc<Library>>, limit: u32) -> AppResult<Vec<HistoryEntry>> {
    Ok(library.history(limit)?)
}

#[tauri::command]
pub fn library_series(library: State<'_, Arc<Library>>) -> AppResult<Vec<SeriesSummary>> {
    Ok(library.series_list()?)
}

#[tauri::command]
pub fn library_series_detail(library: State<'_, Arc<Library>>, key: String) -> AppResult<Option<SeriesDetail>> {
    Ok(library.series_detail(&key)?)
}

/// The library's part of the title bar search (SPEC 2)
#[tauri::command]
pub fn library_search(library: State<'_, Arc<Library>>, query: String, limit: usize) -> AppResult<LibrarySearch> {
    Ok(library.search(&query, limit.clamp(1, 50))?)
}

#[tauri::command]
pub fn library_folders(library: State<'_, Arc<Library>>) -> AppResult<Vec<Folder>> {
    Ok(library.folders()?)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddedFolder {
    pub folder: Folder,
    /// Series found in it
    pub series: Vec<String>,
}

/// Adds a library folder and scans it (off the main thread: a big folder takes a while)
#[tauri::command]
pub async fn library_add_folder(app: AppHandle, library: State<'_, Arc<Library>>, path: String) -> AppResult<AddedFolder> {
    if !Path::new(&path).is_dir() {
        return Err(AppError::NotAFolder(path));
    }
    let library = library.inner().clone();
    let added = tauri::async_runtime::spawn_blocking(move || -> AppResult<AddedFolder> {
        let folder = library.add_folder(&path)?;
        let series = library.scan_dir(Path::new(&path), Some(folder.id))?;
        Ok(AddedFolder { folder, series })
    })
    .await
    .map_err(|e| AppError::Task(e.to_string()))??;
    if let Err(e) = app.emit(CHANGED_EVENT, ()) {
        eprintln!("[library] emit: {e}");
    }
    Ok(added)
}

#[tauri::command]
pub fn library_remove_folder(app: AppHandle, library: State<'_, Arc<Library>>, id: i64) -> AppResult<()> {
    library.remove_folder(id)?;
    if let Err(e) = app.emit(CHANGED_EVENT, ()) {
        eprintln!("[library] emit: {e}");
    }
    Ok(())
}

/// Show a folder in Explorer (the series page, a library folder)
#[tauri::command]
pub fn app_reveal_folder(path: String) -> AppResult<()> {
    if !Path::new(&path).is_dir() {
        return Err(AppError::NotAFolder(path));
    }
    std::process::Command::new("explorer").arg(&path).spawn()?;
    Ok(())
}
