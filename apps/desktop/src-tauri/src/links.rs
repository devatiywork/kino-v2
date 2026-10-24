//! The one place where the player's library and the torrents meet (SPEC 5, 7): a finished
//! torrent's video files are linked to the library, the series page learns which torrents can
//! bring its deleted episodes back, and «Освободить место» stops their seeding before the files
//! go. Neither module knows the other; only this one knows both.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::error::AppResult;
use crate::library::commands::CHANGED_EVENT as LIBRARY_CHANGED;
use crate::library::sources::{sidecars, SourcedFile};
use crate::library::Library;
use crate::torrent::commands::CHANGED_EVENT as TORRENTS_CHANGED;
use crate::torrent::store::Item;
use crate::torrent::{ArchiveEntry, Finished, Torrents};

fn emit(app: &AppHandle, event: &str) {
    if let Err(e) = app.emit(event, ()) {
        eprintln!("[links] emit {event}: {e}");
    }
}

fn sourced(files: Vec<(PathBuf, String)>) -> Vec<SourcedFile> {
    files.into_iter().map(|(path, inner)| SourcedFile { path, inner }).collect()
}

fn link(library: &Library, torrents: &Torrents, item: &Item) -> anyhow::Result<usize> {
    let files: Vec<_> = torrents.content_files(item)?.into_iter().filter(|(path, _)| path.exists()).collect();
    Ok(library.link_source(&item.info_hash, &sourced(files))?)
}

/// A torrent finished: its episodes join the library, on their old rows if they were there before
pub fn link_finished(app: &AppHandle, library: &Library, torrents: &Torrents, done: &Finished) {
    match link(library, torrents, &done.item) {
        Ok(0) => {}
        Ok(_) => emit(app, LIBRARY_CHANGED),
        Err(e) => eprintln!("[links] {}: {e:#}", done.item.name),
    }
}

/// The start of the app: torrents finished before the link existed (or while it failed)
pub fn link_all(library: &Library, torrents: &Torrents) -> anyhow::Result<usize> {
    let mut changed = 0;
    for item in torrents.store().archive("")? {
        if item.completed_at.is_some() && !item.files_deleted {
            changed += link(library, torrents, &item)?;
        }
    }
    Ok(changed)
}

/// A torrent some episodes of a series came from
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesSource {
    pub torrent: ArchiveEntry,
    pub episodes: usize,
    /// Gone from the disk: «Скачать снова» brings them back
    pub missing: usize,
}

/// SPEC 5: the torrents of the series' episodes that are still in the archive
#[tauri::command]
pub fn app_series_sources(library: State<'_, Arc<Library>>, torrents: State<'_, Arc<Torrents>>, key: String) -> AppResult<Vec<SeriesSource>> {
    let mut found = Vec::new();
    for source in library.series_sources(&key)? {
        if let Some(torrent) = torrents.entry_by_hash(&source.source)? {
            found.push(SeriesSource { torrent, episodes: source.episodes, missing: source.missing });
        }
    }
    Ok(found)
}

/// What «Освободить место» would delete
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonSpace {
    pub files: usize,
    pub bytes: u64,
    /// Torrents that stop seeding: their files are among these
    pub seeding: Vec<String>,
    /// Could not be deleted (open in another program)
    pub failed: usize,
}

fn season_space(library: &Library, torrents: &Torrents, key: &str, season: Option<u32>) -> anyhow::Result<(SeasonSpace, Vec<PathBuf>, Vec<Item>)> {
    let files = library.season_files(key, season)?;
    let mut paths: Vec<PathBuf> = Vec::new();
    for file in &files {
        paths.push(file.path.clone());
        paths.extend(sidecars(&file.path));
    }
    let bytes = paths.iter().filter_map(|p| std::fs::metadata(p).ok()).map(|m| m.len()).sum();
    let sources: BTreeSet<&str> = files.iter().filter_map(|f| f.source.as_deref()).collect();
    let mut items = Vec::new();
    for source in sources {
        if let Some(item) = torrents.store().item_by_hash(source)? {
            items.push(item);
        }
    }
    let seeding = items.iter().filter(|i| i.in_downloads).map(|i| i.name.clone()).collect();
    Ok((SeasonSpace { files: files.len(), bytes, seeding, failed: 0 }, paths, items))
}

#[tauri::command]
pub fn app_season_space(library: State<'_, Arc<Library>>, torrents: State<'_, Arc<Torrents>>, key: String, season: Option<u32>) -> AppResult<SeasonSpace> {
    Ok(season_space(&library, &torrents, &key, season)?.0)
}

/// Folders a torrent made that hold no file any more
fn remove_if_empty(dir: &Path) -> std::io::Result<bool> {
    if !dir.is_dir() {
        return Ok(false);
    }
    let mut empty = true;
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        empty &= path.is_dir() && remove_if_empty(&path)?;
    }
    if empty {
        std::fs::remove_dir(dir)?;
    }
    Ok(empty)
}

/// SPEC 3.3 «Освободить место»: the files of a watched season leave the disk, the history and
/// the progress stay. A torrent they belong to leaves the downloads first (it cannot seed
/// without them); one left with no files at all is marked «Файлы удалены» — the series page then
/// offers «Скачать снова»
#[tauri::command]
pub async fn app_free_season(
    app: AppHandle,
    library: State<'_, Arc<Library>>,
    torrents: State<'_, Arc<Torrents>>,
    key: String,
    season: Option<u32>,
) -> AppResult<SeasonSpace> {
    let (mut space, paths, items) = season_space(&library, &torrents, &key, season)?;
    for item in items.iter().filter(|i| i.in_downloads) {
        torrents.remove(item.id, false).await?;
    }
    for path in &paths {
        if let Err(e) = std::fs::remove_file(path) {
            eprintln!("[links] delete {}: {e}", path.display());
            space.failed += 1;
        }
    }
    for item in &items {
        let left = torrents.content_files(item)?.iter().any(|(path, _)| path.exists());
        if !left {
            if item.file_count > 1 {
                if let Err(e) = remove_if_empty(&item.output_folder()) {
                    eprintln!("[links] folder of {}: {e}", item.name);
                }
            }
            torrents.store().leave_downloads(item.id, true, 0)?;
        }
    }
    emit(&app, LIBRARY_CHANGED);
    emit(&app, TORRENTS_CHANGED);
    Ok(space)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_folders_without_files_are_removed() {
        let root = std::env::temp_dir().join(format!("kino-links-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("Show.S01").join("Subs")).unwrap();
        std::fs::create_dir_all(root.join("Other")).unwrap();
        std::fs::write(root.join("Other").join("keep.txt"), b"1").unwrap();
        assert!(remove_if_empty(&root.join("Show.S01")).unwrap());
        assert!(!root.join("Show.S01").exists());
        assert!(!remove_if_empty(&root).unwrap(), "a file is left");
        assert!(root.join("Other").join("keep.txt").exists());
        std::fs::remove_dir_all(&root).unwrap();
    }
}
