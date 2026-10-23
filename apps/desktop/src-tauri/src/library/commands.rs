//! Tauri commands of the library; the renderer calls them through src/shared/ipc/library.ts

use std::sync::Arc;

use tauri::State;

use super::{HistoryEntry, Library, LibraryFile};
use crate::error::AppResult;

pub const CHANGED_EVENT: &str = "library://changed";

#[tauri::command]
pub fn library_continue_watching(library: State<'_, Arc<Library>>, limit: u32) -> AppResult<Vec<LibraryFile>> {
    Ok(library.continue_watching(limit)?)
}

#[tauri::command]
pub fn library_history(library: State<'_, Arc<Library>>, limit: u32) -> AppResult<Vec<HistoryEntry>> {
    Ok(library.history(limit)?)
}
