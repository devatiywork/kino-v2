//! Where files came from (SPEC 5, 7): a source is an opaque id the app gives — a torrent's info
//! hash — with each file's path inside it. The library never asks what a source is; it only
//! keeps a file's row (position, history, series) tied to its place in the source, so a source
//! downloaded again, even into another folder, brings the episodes back where they were.

use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension, Transaction};

use super::episode::describe;
use super::{scan, Library};

/// A file a source brought: where it lies and its path inside the source
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourcedFile {
    pub path: PathBuf,
    pub inner: String,
}

/// A source of a series' episodes and how many of them are gone from the disk
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeriesSource {
    pub source: String,
    pub episodes: usize,
    pub missing: usize,
}

/// A file of a season on disk, for «Освободить место»
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeasonFile {
    pub path: PathBuf,
    pub source: Option<String>,
}

/// Subtitles and audio tracks next to a video, the way the player picks them up
const SIDECAR_EXTENSIONS: &[&str] = &["srt", "ass", "ssa", "sub", "idx", "vtt", "sup", "mka", "ac3", "eac3", "dts", "aac", "flac", "mp3", "ogg", "opus"];

/// `Серия 5.ru.srt`, `Серия 5.English.mka` next to `Серия 5.mkv`
pub fn sidecars(video: &Path) -> Vec<PathBuf> {
    let (Some(dir), Some(stem)) = (video.parent(), video.file_stem().and_then(|s| s.to_str())) else { return Vec::new() };
    let prefix = format!("{}.", stem.to_lowercase());
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p != video)
        .filter(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_lowercase();
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or_default();
            name.starts_with(&prefix) && SIDECAR_EXTENSIONS.iter().any(|s| s.eq_ignore_ascii_case(ext))
        })
        .collect()
}

/// The second row of the same file goes into the first: its viewings, the place it was left
/// last, «просмотрено» if either was watched
fn merge(tx: &Transaction, keep: i64, gone: i64) -> rusqlite::Result<()> {
    tx.execute("UPDATE player_views SET file_id = ?1 WHERE file_id = ?2", params![keep, gone])?;
    tx.execute(
        "UPDATE player_files SET
            position = CASE WHEN COALESCE((SELECT last_played_at FROM player_files WHERE id = ?2), 0) > COALESCE(last_played_at, 0)
                THEN (SELECT position FROM player_files WHERE id = ?2) ELSE position END,
            last_played_at = NULLIF(MAX(COALESCE(last_played_at, 0), COALESCE((SELECT last_played_at FROM player_files WHERE id = ?2), 0)), 0),
            watched = MAX(watched, (SELECT watched FROM player_files WHERE id = ?2)),
            folder_id = COALESCE(folder_id, (SELECT folder_id FROM player_files WHERE id = ?2)),
            duration = COALESCE(duration, (SELECT duration FROM player_files WHERE id = ?2))
         WHERE id = ?1",
        params![keep, gone],
    )?;
    tx.execute("DELETE FROM player_files WHERE id = ?1", [gone])?;
    Ok(())
}

impl Library {
    /// The video files of a source are on disk (a torrent finished): new ones join the library
    /// (invisible until played or found in a library folder), known ones move to where they are
    /// now. Returns how many rows changed
    pub fn link_source(&self, source: &str, files: &[SourcedFile]) -> rusqlite::Result<usize> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let mut changed = 0;
        for file in files.iter().filter(|f| scan::is_video(&f.path)) {
            let path = file.path.to_string_lossy();
            let by_source: Option<(i64, String)> = tx
                .query_row(
                    "SELECT id, path FROM player_files WHERE source = ?1 AND source_path = ?2",
                    params![source, file.inner],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            let by_path: Option<i64> = tx.query_row("SELECT id FROM player_files WHERE path = ?1", [&*path], |r| r.get(0)).optional()?;
            match (by_source, by_path) {
                (Some((_, old)), _) if old == path => continue,
                (Some((id, _)), by_path) => {
                    if let Some(other) = by_path {
                        merge(&tx, id, other)?;
                    }
                    let info = describe(&file.path);
                    let (series_key, series_title) = info.series.as_ref().map(|(k, t)| (Some(k.as_str()), Some(t.as_str()))).unwrap_or_default();
                    tx.execute(
                        "UPDATE player_files SET path = ?2, title = ?3, series_key = ?4, series_title = ?5,
                            season = ?6, episode = ?7, series_dir = ?8 WHERE id = ?1",
                        params![id, path, info.title, series_key, series_title, info.season, info.episode, info.series_dir],
                    )?;
                }
                (None, Some(id)) => {
                    tx.execute("UPDATE player_files SET source = ?2, source_path = ?3 WHERE id = ?1", params![id, source, file.inner])?;
                }
                (None, None) => {
                    let info = describe(&file.path);
                    let (series_key, series_title) = info.series.as_ref().map(|(k, t)| (Some(k.as_str()), Some(t.as_str()))).unwrap_or_default();
                    tx.execute(
                        "INSERT INTO player_files (path, title, series_key, series_title, season, episode, series_dir, source, source_path)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                        params![path, info.title, series_key, series_title, info.season, info.episode, info.series_dir, source, file.inner],
                    )?;
                }
            }
            changed += 1;
        }
        tx.commit()?;
        Ok(changed)
    }

    /// The sources a series' episodes came from, with how many are gone from the disk
    pub fn series_sources(&self, key: &str) -> rusqlite::Result<Vec<SeriesSource>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT source, path FROM player_files WHERE series_key = ?1 AND source IS NOT NULL ORDER BY source")?;
        let rows = stmt.query_map([key], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        let mut sources: Vec<SeriesSource> = Vec::new();
        for row in rows {
            let (source, path) = row?;
            let missing = !Path::new(&path).exists();
            match sources.last_mut() {
                Some(last) if last.source == source => {
                    last.episodes += 1;
                    last.missing += usize::from(missing);
                }
                _ => sources.push(SeriesSource { source, episodes: 1, missing: usize::from(missing) }),
            }
        }
        Ok(sources)
    }

    /// The files of a season still on disk; `season` None — episodes without a season number
    pub fn season_files(&self, key: &str, season: Option<u32>) -> rusqlite::Result<Vec<SeasonFile>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT path, source FROM player_files WHERE series_key = ?1 AND season IS ?2")?;
        let rows = stmt.query_map(params![key, season], |r| Ok(SeasonFile { path: PathBuf::from(r.get::<_, String>(0)?), source: r.get(1)? }))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?.into_iter().filter(|f| f.path.exists()).collect())
    }

    /// The file counts as played just now (tests)
    #[cfg(test)]
    pub(crate) fn touch(&self, path: &str) -> rusqlite::Result<()> {
        self.conn().execute("UPDATE player_files SET last_played_at = ?2 WHERE path = ?1", params![path, super::now_ms()])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::{now_ms, Library};

    fn dir(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("kino-src-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn season(root: &Path, episodes: &[u32]) -> Vec<SourcedFile> {
        let folder = root.join("Show.S01.1080p");
        std::fs::create_dir_all(&folder).unwrap();
        episodes
            .iter()
            .map(|e| {
                let path = folder.join(format!("Show.S01E{e:02}.mkv"));
                std::fs::write(&path, b"video").unwrap();
                SourcedFile { inner: format!(r"Show.S01.1080p\Show.S01E{e:02}.mkv"), path }
            })
            .collect()
    }

    #[test]
    fn a_source_downloaded_again_elsewhere_keeps_the_progress() {
        let lib = Library::in_memory();
        let first = dir("first");
        let files = season(&first, &[1, 2]);
        assert_eq!(lib.link_source("abc", &files).unwrap(), 2);
        assert_eq!(lib.link_source("abc", &files).unwrap(), 0, "nothing new");

        let e1 = lib.register(&files[0].path.to_string_lossy(), &describe(&files[0].path), Some(1000.0)).unwrap();
        lib.save_progress(e1.id, 950.0, Some(1000.0), &mut None, now_ms()).unwrap();
        std::fs::remove_dir_all(&first).unwrap();
        assert_eq!(lib.series_sources("show:show").unwrap(), [SeriesSource { source: "abc".into(), episodes: 2, missing: 2 }]);

        // Downloaded again into another folder: the same rows, now there
        let second = dir("second");
        let again = season(&second, &[1, 2]);
        assert_eq!(lib.link_source("abc", &again).unwrap(), 2);
        let detail = lib.series_detail("show:show").unwrap().unwrap();
        let e1 = &detail.seasons[0].episodes[0];
        assert_eq!((e1.path.as_str(), e1.watched, e1.exists), (again[0].path.to_string_lossy().as_ref(), true, true));
        assert_eq!(lib.history(10).unwrap().len(), 1, "the viewing stays");
        assert_eq!(lib.series_sources("show:show").unwrap()[0].missing, 0);
        std::fs::remove_dir_all(&second).unwrap();
    }

    #[test]
    fn a_file_the_library_already_knows_gets_its_source_and_a_duplicate_row_merges() {
        let lib = Library::in_memory();
        let root = dir("merge");
        let files = season(&root, &[1]);
        // Watched before the link existed (an older version, a library folder)
        let known = lib.register(&files[0].path.to_string_lossy(), &describe(&files[0].path), Some(1000.0)).unwrap();
        lib.save_progress(known.id, 300.0, Some(1000.0), &mut None, now_ms()).unwrap();
        lib.link_source("abc", &files).unwrap();
        assert_eq!(lib.series_sources("show:show").unwrap()[0].episodes, 1);

        // Downloaded again elsewhere, and a rescan saw the new copy first: one row stays, with the viewing
        let other = dir("merge-other");
        let again = season(&other, &[1]);
        lib.add_scanned(&[again[0].path.clone()], None).unwrap();
        lib.link_source("abc", &again).unwrap();
        let count: i64 = lib.conn().query_row("SELECT count(*) FROM player_files", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        assert_eq!(lib.history(10).unwrap()[0].file.path, again[0].path.to_string_lossy());
        std::fs::remove_dir_all(&root).unwrap();
        std::fs::remove_dir_all(&other).unwrap();
    }

    #[test]
    fn season_files_and_sidecars() {
        let lib = Library::in_memory();
        let root = dir("season");
        let files = season(&root, &[1, 2]);
        lib.link_source("abc", &files).unwrap();
        let sub = files[0].path.with_file_name("Show.S01E01.ru.srt");
        std::fs::write(&sub, b"1").unwrap();
        std::fs::write(files[0].path.with_file_name("Show.S01E010.srt"), b"1").unwrap();
        assert_eq!(sidecars(&files[0].path), [sub], "only this episode's tracks");
        let on_disk = lib.season_files("show:show", Some(1)).unwrap();
        assert_eq!(on_disk.len(), 2);
        assert!(on_disk.iter().all(|f| f.source.as_deref() == Some("abc")));
        std::fs::remove_file(&files[1].path).unwrap();
        assert_eq!(lib.season_files("show:show", Some(1)).unwrap().len(), 1);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_series_whose_files_are_all_gone_stays_listed_when_a_source_can_bring_them_back() {
        let lib = Library::in_memory();
        let root = dir("listed");
        let files = season(&root, &[1]);
        lib.link_source("abc", &files).unwrap();
        lib.touch(&files[0].path.to_string_lossy()).unwrap();
        std::fs::remove_dir_all(&root).unwrap();
        let list = lib.series_list().unwrap();
        assert_eq!(list.len(), 1, "played, its torrent can download it again");
    }
}
