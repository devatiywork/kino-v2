//! Player's library in SQLite (SPEC 3.2, 7): files and their positions, viewing history,
//! track memory per series. Knows nothing about torrents.

pub mod commands;
pub mod episode;
pub mod track_pref;

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::db;
use crate::player::tracks::TrackKind;
use episode::FileInfo;
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

pub struct Library {
    conn: Mutex<Connection>,
    thumbs: PathBuf,
}

const FILE_COLUMNS: &str =
    "f.id, f.path, f.title, f.series_title, f.season, f.episode, f.duration, f.position, f.watched, f.last_played_at, f.has_thumb";

impl Library {
    pub fn open(db_path: &Path, thumbs: PathBuf) -> rusqlite::Result<Self> {
        Ok(Self { conn: Mutex::new(db::open(db_path)?), thumbs })
    }

    #[cfg(test)]
    pub fn in_memory() -> Self {
        Self { conn: Mutex::new(db::open_in_memory().unwrap()), thumbs: std::env::temp_dir().join("kino-test-thumbs") }
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
            "INSERT INTO player_files (path, title, series_key, series_title, season, episode, duration, last_played_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT (path) DO UPDATE SET
                title = excluded.title, series_key = excluded.series_key, series_title = excluded.series_title,
                season = excluded.season, episode = excluded.episode,
                duration = COALESCE(excluded.duration, duration), last_played_at = excluded.last_played_at
             RETURNING id",
            params![path, info.title, series_key, series_title, info.season, info.episode, duration, now_ms()],
            |r| r.get(0),
        )?;
        Ok(FileRef { id, series_key: series_key.map(str::to_owned) })
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

    /// Unfinished files, the latest per series first (SPEC 3.2 «Продолжить», «Не досмотрено»)
    pub fn continue_watching(&self, limit: u32) -> rusqlite::Result<Vec<LibraryFile>> {
        let conn = self.conn();
        // The latest file of each series decides: an episode left halfway is not offered
        // once the next ones were watched
        let sql = format!(
            "SELECT {FILE_COLUMNS} FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY COALESCE(series_key, 'file:' || id) ORDER BY last_played_at DESC) AS n
                FROM player_files WHERE last_played_at IS NOT NULL
             ) AS f
             WHERE f.n = 1 AND f.watched = 0 AND f.position >= ?1
             ORDER BY f.last_played_at DESC LIMIT ?2"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![RESUME_MIN, limit], |r| self.file_from_row(r))?;
        rows.collect()
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
