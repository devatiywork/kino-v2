//! Player's library in SQLite (SPEC 3.2, 3.3, 7): library folders, files and their positions,
//! viewing history, series, track memory per series. Knows nothing about torrents.

pub mod commands;
pub mod episode;
pub mod scan;
pub mod series;
pub mod track_pref;

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::db;
use crate::player::tracks::TrackKind;
use episode::{describe, FileInfo};
use series::{Episode, Season, SeriesSummary};
use track_pref::TrackPref;

/// An episode counts as watched after 90% (SPEC 3.2)
pub const WATCHED_RATIO: f64 = 0.9;
/// Shorter starts are not worth resuming
const RESUME_MIN: f64 = 10.0;
/// Close to the end — start over instead of resuming the credits
const RESUME_TAIL: f64 = 30.0;

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or_default()
}

pub fn is_watched(position: f64, duration: Option<f64>) -> bool {
    matches!(duration, Some(d) if d > 0.0 && position / d >= WATCHED_RATIO)
}

/// Where to continue a file, if anywhere
pub fn resume_from(position: f64, duration: Option<f64>, watched: bool) -> Option<f64> {
    if watched || position < RESUME_MIN {
        return None;
    }
    match duration {
        Some(d) if d - position < RESUME_TAIL => None,
        _ => Some(position),
    }
}

/// A file as the home screen shows it
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFile {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub series_title: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub duration: Option<f64>,
    pub position: f64,
    pub watched: bool,
    pub last_played_at: Option<i64>,
    /// Frame of the last stop (absolute path), if taken
    pub thumb: Option<String>,
    /// The file is still on disk
    pub exists: bool,
}

/// One viewing: when, what and where it stopped
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub view_id: i64,
    pub started_at: i64,
    pub ended_at: i64,
    /// Position and duration at the end of this viewing
    pub position: f64,
    pub watched: bool,
    pub file: LibraryFile,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SeriesPrefs {
    pub audio: Option<TrackPref>,
    pub sub: Option<TrackPref>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileRef {
    pub id: i64,
    pub series_key: Option<String>,
}

/// A folder the library scans for series (SPEC 6 «папки сериалов»)
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i64,
    pub path: String,
    pub exists: bool,
}

/// What is remembered for a series, as the series page shows it
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum PrefLabel {
    Track { label: String },
    Off,
}

impl PrefLabel {
    fn of(pref: &TrackPref) -> Self {
        match pref {
            TrackPref::Off => PrefLabel::Off,
            TrackPref::Track { lang, title, .. } => {
                PrefLabel::Track { label: title.clone().or_else(|| lang.clone()).unwrap_or_else(|| "—".into()) }
            }
        }
    }
}

/// The series page (SPEC 3.3): seasons with episodes, what to watch, the track memory
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesDetail {
    pub key: String,
    pub title: String,
    pub dir: Option<String>,
    pub seasons: Vec<Season>,
    pub next_up: Option<i64>,
    pub audio: Option<PrefLabel>,
    pub subtitles: Option<PrefLabel>,
}

pub struct Library {
    conn: Mutex<Connection>,
    thumbs: PathBuf,
    /// Series folders already scanned in this run (opening an episode scans its folder once)
    scanned: Mutex<std::collections::HashSet<String>>,
}

const FILE_COLUMNS: &str =
    "f.id, f.path, f.title, f.series_title, f.season, f.episode, f.duration, f.position, f.watched, f.last_played_at, f.has_thumb";

impl Library {
    pub fn open(db_path: &Path, thumbs: PathBuf) -> rusqlite::Result<Self> {
        Ok(Self { conn: Mutex::new(db::open(db_path)?), thumbs, scanned: Mutex::default() })
    }

    #[cfg(test)]
    pub fn in_memory() -> Self {
        Self {
            conn: Mutex::new(db::open_in_memory().unwrap()),
            thumbs: std::env::temp_dir().join("kino-test-thumbs"),
            scanned: Mutex::default(),
        }
    }

    /// Scan a folder for episodes; `folder_id` — when it is a library folder
    pub fn scan_dir(&self, dir: &Path, folder_id: Option<i64>) -> rusqlite::Result<Vec<String>> {
        self.scanned.lock().unwrap_or_else(|p| p.into_inner()).insert(dir.to_string_lossy().to_lowercase());
        self.add_scanned(&scan::video_files(dir), folder_id)
    }

    /// The series folder of an opened episode has not been scanned in this run yet
    pub fn needs_scan(&self, dir: &str) -> bool {
        !self.scanned.lock().unwrap_or_else(|p| p.into_inner()).contains(&dir.to_lowercase())
    }

    /// Rescan every library folder (start of the app): new episodes appear, nothing is removed
    pub fn rescan_folders(&self) -> rusqlite::Result<()> {
        for folder in self.folders()? {
            if folder.exists {
                self.scan_dir(Path::new(&folder.path), Some(folder.id))?;
            }
        }
        Ok(())
    }

    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn thumb_path(&self, file_id: i64) -> PathBuf {
        self.thumbs.join(format!("{file_id}.jpg"))
    }

    fn file_from_row(&self, row: &Row) -> rusqlite::Result<LibraryFile> {
        let id: i64 = row.get(0)?;
        let path: String = row.get(1)?;
        let has_thumb: bool = row.get(10)?;
        let exists = Path::new(&path).exists();
        Ok(LibraryFile {
            id,
            title: row.get(2)?,
            series_title: row.get(3)?,
            season: row.get(4)?,
            episode: row.get(5)?,
            duration: row.get(6)?,
            position: row.get(7)?,
            watched: row.get(8)?,
            last_played_at: row.get(9)?,
            thumb: has_thumb.then(|| self.thumb_path(id).to_string_lossy().into_owned()),
            exists,
            path,
        })
    }

    /// Remember the file as just opened; returns its id and series
    pub fn register(&self, path: &str, info: &FileInfo, duration: Option<f64>) -> rusqlite::Result<FileRef> {
        let (series_key, series_title) = match &info.series {
            Some((key, title)) => (Some(key.as_str()), Some(title.as_str())),
            None => (None, None),
        };
        let id = self.conn().query_row(
            "INSERT INTO player_files (path, title, series_key, series_title, season, episode, series_dir, duration, last_played_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT (path) DO UPDATE SET
                title = excluded.title, series_key = excluded.series_key, series_title = excluded.series_title,
                season = excluded.season, episode = excluded.episode, series_dir = excluded.series_dir,
                duration = COALESCE(excluded.duration, duration), last_played_at = excluded.last_played_at
             RETURNING id",
            params![path, info.title, series_key, series_title, info.season, info.episode, info.series_dir, duration, now_ms()],
            |r| r.get(0),
        )?;
        Ok(FileRef { id, series_key: series_key.map(str::to_owned) })
    }

    /// Episodes found on disk: new ones are added, known ones keep their position and history.
    /// Films (no episode mark) are not part of the series library. Returns the series keys seen
    pub fn add_scanned(&self, files: &[std::path::PathBuf], folder_id: Option<i64>) -> rusqlite::Result<Vec<String>> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let mut keys: Vec<String> = Vec::new();
        {
            let mut stmt = tx.prepare(
                "INSERT INTO player_files (path, title, series_key, series_title, season, episode, series_dir, folder_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT (path) DO UPDATE SET
                    title = excluded.title, series_key = excluded.series_key, series_title = excluded.series_title,
                    season = excluded.season, episode = excluded.episode, series_dir = excluded.series_dir,
                    folder_id = COALESCE(excluded.folder_id, folder_id)",
            )?;
            for path in files {
                let info = describe(path);
                let Some((key, title)) = &info.series else { continue };
                stmt.execute(params![path.to_string_lossy(), info.title, key, title, info.season, info.episode, info.series_dir, folder_id])?;
                if !keys.contains(key) {
                    keys.push(key.clone());
                }
            }
        }
        tx.commit()?;
        Ok(keys)
    }

    pub fn add_folder(&self, path: &str) -> rusqlite::Result<Folder> {
        let id: i64 = self.conn().query_row(
            "INSERT INTO player_folders (path, added_at) VALUES (?1, ?2)
             ON CONFLICT (path) DO UPDATE SET path = excluded.path RETURNING id",
            params![path, now_ms()],
            |r| r.get(0),
        )?;
        Ok(Folder { id, path: path.to_string(), exists: Path::new(path).is_dir() })
    }

    /// The folder leaves the library; its files keep their history, unplayed series disappear
    pub fn remove_folder(&self, id: i64) -> rusqlite::Result<()> {
        let conn = self.conn();
        conn.execute("UPDATE player_files SET folder_id = NULL WHERE folder_id = ?1", [id])?;
        conn.execute("DELETE FROM player_folders WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn folders(&self) -> rusqlite::Result<Vec<Folder>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, path FROM player_folders ORDER BY added_at")?;
        let rows = stmt.query_map([], |r| {
            let path: String = r.get(1)?;
            Ok(Folder { id: r.get(0)?, exists: Path::new(&path).is_dir(), path })
        })?;
        rows.collect()
    }

    /// Files of all series (or of one), with what grouping into series needs
    fn episodes(&self, key: Option<&str>) -> rusqlite::Result<Vec<Episode>> {
        let conn = self.conn();
        let sql = format!(
            "SELECT {FILE_COLUMNS}, f.series_key, f.series_title, f.series_dir, f.folder_id
             FROM player_files f WHERE f.series_key IS NOT NULL AND (?1 IS NULL OR f.series_key = ?1)"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([key], |r| {
            Ok(Episode {
                file: self.file_from_row(r)?,
                series_key: r.get(11)?,
                series_title: r.get::<_, Option<String>>(12)?.unwrap_or_default(),
                series_dir: r.get(13)?,
                in_folder: r.get::<_, Option<i64>>(14)?.is_some(),
            })
        })?;
        rows.collect()
    }

    pub fn series_list(&self) -> rusqlite::Result<Vec<SeriesSummary>> {
        Ok(series::summaries(self.episodes(None)?))
    }

    pub fn series_detail(&self, key: &str) -> rusqlite::Result<Option<SeriesDetail>> {
        let episodes = self.episodes(Some(key))?;
        let Some(first) = episodes.first() else { return Ok(None) };
        let (title, dir) = (first.series_title.clone(), episodes.iter().find_map(|e| e.series_dir.clone()));
        let files: Vec<LibraryFile> = episodes.into_iter().map(|e| e.file).filter(|f| f.exists || f.last_played_at.is_some()).collect();
        let seasons = series::seasons(files);
        let ordered: Vec<LibraryFile> = seasons.iter().flat_map(|s| s.episodes.iter().cloned()).collect();
        let next_up = series::next_up(&ordered).map(|i| ordered[i].id);
        let prefs = self.series_prefs(key)?;
        Ok(Some(SeriesDetail {
            key: key.to_string(),
            title,
            dir,
            seasons,
            next_up,
            audio: prefs.audio.as_ref().map(PrefLabel::of),
            subtitles: prefs.sub.as_ref().map(PrefLabel::of),
        }))
    }

    /// The episode next to a file of a series; `same_season` — for autoplay
    pub fn neighbor(&self, file_id: i64, step: i32, same_season: bool) -> rusqlite::Result<Option<LibraryFile>> {
        let key: Option<String> = self
            .conn()
            .query_row("SELECT series_key FROM player_files WHERE id = ?1", [file_id], |r| r.get(0))
            .optional()?
            .flatten();
        let Some(key) = key else { return Ok(None) };
        let mut files: Vec<LibraryFile> = self.episodes(Some(&key))?.into_iter().map(|e| e.file).collect();
        series::order(&mut files);
        Ok(series::neighbor(&files, file_id, step, same_season).cloned())
    }

    pub fn setting(&self, key: &str) -> rusqlite::Result<Option<String>> {
        self.conn().query_row("SELECT value FROM app_settings WHERE key = ?1", [key], |r| r.get(0)).optional()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.conn().execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?2",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn resume_position(&self, path: &str) -> rusqlite::Result<Option<f64>> {
        let row: Option<(f64, Option<f64>, bool)> = self
            .conn()
            .query_row("SELECT position, duration, watched FROM player_files WHERE path = ?1", [path], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .optional()?;
        Ok(row.and_then(|(position, duration, watched)| resume_from(position, duration, watched)))
    }

    /// Position of the file and of the current viewing; the viewing row appears on the first save
    pub fn save_progress(&self, file_id: i64, position: f64, duration: Option<f64>, view: &mut Option<i64>, started_at: i64) -> rusqlite::Result<()> {
        let now = now_ms();
        let conn = self.conn();
        conn.execute(
            "UPDATE player_files SET position = ?2, duration = COALESCE(?3, duration),
                watched = MAX(watched, ?4), last_played_at = ?5 WHERE id = ?1",
            params![file_id, position, duration, is_watched(position, duration), now],
        )?;
        match view {
            Some(id) => {
                conn.execute(
                    "UPDATE player_views SET ended_at = ?2, position = ?3, duration = COALESCE(?4, duration) WHERE id = ?1",
                    params![*id, now, position, duration],
                )?;
            }
            None => {
                conn.execute(
                    "INSERT INTO player_views (file_id, started_at, ended_at, position, duration) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![file_id, started_at, now, position, duration],
                )?;
                *view = Some(conn.last_insert_rowid());
            }
        }
        Ok(())
    }

    pub fn set_thumb(&self, file_id: i64) -> rusqlite::Result<()> {
        self.conn().execute("UPDATE player_files SET has_thumb = 1 WHERE id = ?1", [file_id])?;
        Ok(())
    }

    pub fn series_prefs(&self, key: &str) -> rusqlite::Result<SeriesPrefs> {
        let pref = |mode: Option<String>, lang: Option<String>, title: Option<String>, external: bool| match mode.as_deref() {
            Some("off") => Some(TrackPref::Off),
            Some("track") => Some(TrackPref::Track { lang, title, external }),
            _ => None,
        };
        let prefs = self
            .conn()
            .query_row(
                "SELECT audio_mode, audio_lang, audio_title, audio_external, sub_mode, sub_lang, sub_title, sub_external
                 FROM player_series_tracks WHERE series_key = ?1",
                [key],
                |r| {
                    Ok(SeriesPrefs {
                        audio: pref(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?),
                        sub: pref(r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?),
                    })
                },
            )
            .optional()?;
        Ok(prefs.unwrap_or_default())
    }

    pub fn save_pref(&self, key: &str, kind: TrackKind, pref: &TrackPref) -> rusqlite::Result<()> {
        let (mode, lang, title, external) = match pref {
            TrackPref::Off => ("off", None, None, false),
            TrackPref::Track { lang, title, external } => ("track", lang.as_deref(), title.as_deref(), *external),
        };
        let sql = match kind {
            TrackKind::Audio => {
                "INSERT INTO player_series_tracks (series_key, audio_mode, audio_lang, audio_title, audio_external, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT (series_key) DO UPDATE SET
                    audio_mode = ?2, audio_lang = ?3, audio_title = ?4, audio_external = ?5, updated_at = ?6"
            }
            TrackKind::Sub => {
                "INSERT INTO player_series_tracks (series_key, sub_mode, sub_lang, sub_title, sub_external, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT (series_key) DO UPDATE SET
                    sub_mode = ?2, sub_lang = ?3, sub_title = ?4, sub_external = ?5, updated_at = ?6"
            }
            TrackKind::Video => return Ok(()),
        };
        self.conn().execute(sql, params![key, mode, lang, title, external, now_ms()])?;
        Ok(())
    }

    /// What to watch next, most recent first (SPEC 3.2 «Продолжить», «Не досмотрено»): unfinished
    /// films, and per watched series its next episode — the unfinished one, or the one after
    /// the last watched (it starts from the beginning)
    pub fn continue_watching(&self, limit: u32) -> rusqlite::Result<Vec<LibraryFile>> {
        let films: Vec<LibraryFile> = {
            let conn = self.conn();
            let sql = format!(
                "SELECT {FILE_COLUMNS} FROM player_files f
                 WHERE f.series_key IS NULL AND f.last_played_at IS NOT NULL AND f.watched = 0 AND f.position >= ?1"
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([RESUME_MIN], |r| self.file_from_row(r))?;
            rows.collect::<rusqlite::Result<_>>()?
        };
        let mut items: Vec<(i64, LibraryFile)> = films.into_iter().map(|f| (f.last_played_at.unwrap_or_default(), f)).collect();
        for s in self.series_list()? {
            if let (Some(at), Some(next)) = (s.last_played_at, s.next_up) {
                if next.exists {
                    items.push((at, next));
                }
            }
        }
        items.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
        Ok(items.into_iter().take(limit as usize).map(|(_, f)| f).collect())
    }

    /// Viewings, newest first (SPEC 3.2 «История по дням»)
    pub fn history(&self, limit: u32) -> rusqlite::Result<Vec<HistoryEntry>> {
        let conn = self.conn();
        let sql = format!(
            "SELECT {FILE_COLUMNS}, v.id, v.started_at, v.ended_at, v.position, v.duration
             FROM player_views v JOIN player_files f ON f.id = v.file_id
             ORDER BY v.ended_at DESC LIMIT ?1"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([limit], |r| {
            let position: f64 = r.get(14)?;
            let duration: Option<f64> = r.get(15)?;
            Ok(HistoryEntry {
                view_id: r.get(11)?,
                started_at: r.get(12)?,
                ended_at: r.get(13)?,
                position,
                watched: is_watched(position, duration),
                file: self.file_from_row(r)?,
            })
        })?;
        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use episode::describe;

    fn open(lib: &Library, path: &str, duration: f64) -> FileRef {
        lib.register(path, &describe(Path::new(path)), Some(duration)).unwrap()
    }

    #[test]
    fn resume_policy() {
        assert_eq!(resume_from(5.0, Some(3600.0), false), None, "too early");
        assert_eq!(resume_from(1394.0, Some(3600.0), false), Some(1394.0));
        assert_eq!(resume_from(3590.0, Some(3600.0), false), None, "credits");
        assert_eq!(resume_from(1394.0, Some(3600.0), true), None, "watched — from the start");
        assert_eq!(resume_from(1394.0, None, false), Some(1394.0));
    }

    #[test]
    fn progress_resume_and_watched() {
        let lib = Library::in_memory();
        let file = open(&lib, r"E:\S\The.Sopranos.S01E01.mkv", 3600.0);
        assert_eq!(file.series_key.as_deref(), Some("show:the sopranos"));
        let mut view = None;
        lib.save_progress(file.id, 1394.5, Some(3600.0), &mut view, now_ms()).unwrap();
        assert!(view.is_some());
        assert_eq!(lib.resume_position(r"E:\S\The.Sopranos.S01E01.mkv").unwrap(), Some(1394.5));

        lib.save_progress(file.id, 3300.0, Some(3600.0), &mut view, now_ms()).unwrap();
        assert_eq!(lib.resume_position(r"E:\S\The.Sopranos.S01E01.mkv").unwrap(), None, "92% — watched");
        // rewatching from the start keeps it watched
        lib.save_progress(file.id, 20.0, Some(3600.0), &mut view, now_ms()).unwrap();
        let history = lib.history(10).unwrap();
        assert_eq!(history.len(), 1, "one viewing, updated in place");
        assert!(history[0].file.watched);
        assert_eq!(history[0].position, 20.0);
    }

    #[test]
    fn continue_watching_offers_the_latest_unfinished_file_per_series() {
        let lib = Library::in_memory();
        let e1 = open(&lib, r"E:\S\The.Sopranos.S01E01.mkv", 3600.0);
        lib.save_progress(e1.id, 600.0, Some(3600.0), &mut None, now_ms()).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let e2 = open(&lib, r"E:\S\The.Sopranos.S01E02.mkv", 3600.0);
        lib.save_progress(e2.id, 3500.0, Some(3600.0), &mut None, now_ms()).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let film = open(&lib, r"D:\Films\Interstellar.2014.mkv", 10000.0);
        lib.save_progress(film.id, 4000.0, Some(10000.0), &mut None, now_ms()).unwrap();

        let list = lib.continue_watching(10).unwrap();
        // E01 was abandoned, E02 watched to the end: the series is not offered; the film is
        assert_eq!(list.iter().map(|f| f.title.as_str()).collect::<Vec<_>>(), ["Interstellar 2014"]);
        assert_eq!(list[0].position, 4000.0);
        assert!(!list[0].exists);
    }

    /// A folder with a real season on disk: Show.S01E01…E03 and a film
    fn season_on_disk(name: &str) -> (PathBuf, Vec<PathBuf>) {
        let root = std::env::temp_dir().join(format!("kino-lib-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let season = root.join("Show").join("Season 1");
        std::fs::create_dir_all(&season).unwrap();
        let mut files = Vec::new();
        for e in [10, 1, 2] {
            let path = season.join(format!("Show.S01E{e:02}.mkv"));
            std::fs::write(&path, b"").unwrap();
            files.push(path);
        }
        std::fs::write(root.join("Film.2014.mkv"), b"").unwrap();
        (root, files)
    }

    #[test]
    fn scanned_folder_makes_a_series_with_ordered_episodes() {
        let lib = Library::in_memory();
        let (root, _) = season_on_disk("scan");
        let folder = lib.add_folder(&root.to_string_lossy()).unwrap();
        let keys = lib.add_scanned(&scan::video_files(&root), Some(folder.id)).unwrap();
        assert_eq!(keys, ["show:show"], "the film is not a series");

        let list = lib.series_list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!((list[0].title.as_str(), list[0].episodes, list[0].watched), ("Show", 3, 0));
        assert_eq!(list[0].dir.as_deref(), Some(root.join("Show").to_string_lossy().as_ref()));
        assert_eq!(list[0].next_up.as_ref().and_then(|f| f.episode), Some(1), "nothing watched — episode 1");

        let detail = lib.series_detail("show:show").unwrap().unwrap();
        assert_eq!(detail.seasons.len(), 1);
        assert_eq!(detail.seasons[0].episodes.iter().map(|f| f.episode.unwrap()).collect::<Vec<_>>(), [1, 2, 10], "2 before 10");
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn after_a_watched_episode_the_next_one_is_offered_and_neighbours_follow_the_order() {
        let lib = Library::in_memory();
        let (root, files) = season_on_disk("next");
        lib.add_scanned(&files, None).unwrap();
        let e1 = &files[1];
        let file = lib.register(&e1.to_string_lossy(), &describe(e1), Some(1000.0)).unwrap();
        lib.save_progress(file.id, 950.0, Some(1000.0), &mut None, now_ms()).unwrap();

        let next = lib.continue_watching(10).unwrap();
        assert_eq!(next.iter().map(|f| f.episode).collect::<Vec<_>>(), [Some(2)], "E01 watched → E02 from the start");
        assert_eq!(next[0].position, 0.0);

        let e2 = lib.neighbor(file.id, 1, true).unwrap().unwrap();
        assert_eq!(e2.episode, Some(2));
        assert_eq!(lib.neighbor(e2.id, 1, true).unwrap().and_then(|f| f.episode), Some(10));
        assert_eq!(lib.neighbor(file.id, -1, false).unwrap(), None);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn removing_a_folder_hides_unplayed_series_but_keeps_history() {
        let lib = Library::in_memory();
        let (root, files) = season_on_disk("remove");
        let folder = lib.add_folder(&root.to_string_lossy()).unwrap();
        lib.add_scanned(&files, Some(folder.id)).unwrap();
        assert_eq!(lib.folders().unwrap().len(), 1);
        lib.remove_folder(folder.id).unwrap();
        assert!(lib.folders().unwrap().is_empty());
        assert!(lib.series_list().unwrap().is_empty());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn settings_round_trip() {
        let lib = Library::in_memory();
        assert_eq!(lib.setting("autoplay").unwrap(), None);
        lib.set_setting("autoplay", "0").unwrap();
        lib.set_setting("autoplay", "1").unwrap();
        assert_eq!(lib.setting("autoplay").unwrap().as_deref(), Some("1"));
    }

    #[test]
    fn series_track_memory() {
        let lib = Library::in_memory();
        assert_eq!(lib.series_prefs("show:x").unwrap(), SeriesPrefs::default());
        let goblin = TrackPref::Track { lang: Some("rus".into()), title: Some("AVO Goblin".into()), external: false };
        lib.save_pref("show:x", TrackKind::Audio, &goblin).unwrap();
        lib.save_pref("show:x", TrackKind::Sub, &TrackPref::Off).unwrap();
        assert_eq!(lib.series_prefs("show:x").unwrap(), SeriesPrefs { audio: Some(goblin), sub: Some(TrackPref::Off) });
        // changing subtitles keeps the audio choice
        let eng = TrackPref::Track { lang: Some("eng".into()), title: None, external: false };
        lib.save_pref("show:x", TrackKind::Sub, &eng).unwrap();
        let prefs = lib.series_prefs("show:x").unwrap();
        assert_eq!(prefs.sub, Some(eng));
        assert!(matches!(prefs.audio, Some(TrackPref::Track { .. })));
    }
}
