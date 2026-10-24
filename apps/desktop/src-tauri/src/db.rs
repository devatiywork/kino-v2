//! One SQLite database for the app (SPEC 7). Player tables are prefixed `player_`,
//! torrent tables will be `torrent_`; the two sections never reference each other.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

/// Unix time in milliseconds: how both sections store dates
pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or_default()
}

/// Each entry moves the schema one version up; PRAGMA user_version is the current version
const MIGRATIONS: &[&str] = &[
    // 1 — player: files with their position, viewing sessions, track memory per series
    r#"
    CREATE TABLE player_files (
        id             INTEGER PRIMARY KEY,
        path           TEXT    NOT NULL UNIQUE,
        title          TEXT    NOT NULL,
        series_key     TEXT,
        series_title   TEXT,
        season         INTEGER,
        episode        INTEGER,
        duration       REAL,
        position       REAL    NOT NULL DEFAULT 0,
        watched        INTEGER NOT NULL DEFAULT 0,
        last_played_at INTEGER,
        has_thumb      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX player_files_last_played ON player_files (last_played_at);
    CREATE INDEX player_files_series ON player_files (series_key);

    CREATE TABLE player_views (
        id         INTEGER PRIMARY KEY,
        file_id    INTEGER NOT NULL REFERENCES player_files (id) ON DELETE CASCADE,
        started_at INTEGER NOT NULL,
        ended_at   INTEGER NOT NULL,
        position   REAL    NOT NULL,
        duration   REAL
    );
    CREATE INDEX player_views_ended ON player_views (ended_at);

    CREATE TABLE player_series_tracks (
        series_key     TEXT PRIMARY KEY,
        audio_mode     TEXT CHECK (audio_mode IN ('track', 'off')),
        audio_lang     TEXT,
        audio_title    TEXT,
        audio_external INTEGER NOT NULL DEFAULT 0,
        sub_mode       TEXT CHECK (sub_mode IN ('track', 'off')),
        sub_lang       TEXT,
        sub_title      TEXT,
        sub_external   INTEGER NOT NULL DEFAULT 0,
        updated_at     INTEGER NOT NULL
    );
    "#,
    // 2 — library folders (SPEC 3.3, 6), the series folder of each file, app settings
    r#"
    CREATE TABLE player_folders (
        id       INTEGER PRIMARY KEY,
        path     TEXT    NOT NULL UNIQUE,
        added_at INTEGER NOT NULL
    );
    ALTER TABLE player_files ADD COLUMN folder_id INTEGER REFERENCES player_folders (id) ON DELETE SET NULL;
    ALTER TABLE player_files ADD COLUMN series_dir TEXT;
    CREATE INDEX player_files_folder ON player_files (folder_id);

    CREATE TABLE app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    "#,
    // 3 — all settings in one JSON row (settings/mod.rs); the autoplay switch of 0.9 moves there
    r#"
    INSERT INTO app_settings (key, value)
        SELECT 'settings', '{"autoplay":' || CASE value WHEN '0' THEN 'false' ELSE 'true' END || '}'
        FROM app_settings WHERE key = 'player.autoplay';
    DELETE FROM app_settings WHERE key = 'player.autoplay';
    "#,
    // 4 — torrents (SPEC 4): categories, the archive of every torrent ever added, its files.
    // A record never goes away implicitly: removing from downloads or deleting the files keeps it
    r#"
    CREATE TABLE torrent_categories (
        id         INTEGER PRIMARY KEY,
        name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        -- NULL: <downloads folder>\<name>
        folder     TEXT,
        position   INTEGER NOT NULL
    );
    INSERT INTO torrent_categories (name, position) VALUES ('Сериалы', 1), ('Игры', 2), ('Программы', 3);

    CREATE TABLE torrent_items (
        id            INTEGER PRIMARY KEY,
        info_hash     TEXT    NOT NULL UNIQUE,
        name          TEXT    NOT NULL,
        total_size    INTEGER NOT NULL,
        category_id   INTEGER REFERENCES torrent_categories (id) ON DELETE SET NULL,
        -- the folder the user chose; a multi-file torrent gets its own sub-folder in it
        save_dir      TEXT    NOT NULL,
        source_url    TEXT,
        added_at      INTEGER NOT NULL,
        completed_at  INTEGER,
        in_downloads  INTEGER NOT NULL DEFAULT 1,
        paused        INTEGER NOT NULL DEFAULT 0,
        files_deleted INTEGER NOT NULL DEFAULT 0,
        -- JSON array of file indices; NULL — all files
        only_files    TEXT,
        -- uploaded in earlier runs: the ratio survives restarts
        uploaded      INTEGER NOT NULL DEFAULT 0,
        -- name and file paths in lower case: SQLite's LIKE ignores case only for ASCII
        search_text   TEXT    NOT NULL
    );
    CREATE INDEX torrent_items_added ON torrent_items (added_at);

    CREATE TABLE torrent_files (
        item_id INTEGER NOT NULL REFERENCES torrent_items (id) ON DELETE CASCADE,
        idx     INTEGER NOT NULL,
        path    TEXT    NOT NULL,
        size    INTEGER NOT NULL,
        PRIMARY KEY (item_id, idx)
    );
    "#,
    // 5 — bookmarks of the trackers browser (SPEC 4.5)
    r#"
    CREATE TABLE torrent_bookmarks (
        id       INTEGER PRIMARY KEY,
        title    TEXT    NOT NULL,
        url      TEXT    NOT NULL,
        position INTEGER NOT NULL
    );
    INSERT INTO torrent_bookmarks (title, url, position) VALUES
        ('Рутрекер', 'https://rutracker.org/forum/index.php', 1),
        ('RuTor', 'https://rutor.info/', 2);
    "#,
    // 6 — the one link between the sections (SPEC 5, 7): «this video file came from that torrent».
    // The player keeps an opaque source id (the torrent's info hash) and the file's path inside
    // it; it never reads the torrent tables
    r#"
    ALTER TABLE player_files ADD COLUMN source TEXT;
    ALTER TABLE player_files ADD COLUMN source_path TEXT;
    CREATE INDEX player_files_source ON player_files (source, source_path);
    "#,
    // 7 — a torrent's own seeding (SPEC 4.3 «Параметры торрента»): as in the settings, until a
    // ratio, or not at all
    r#"
    ALTER TABLE torrent_items ADD COLUMN seed_mode TEXT NOT NULL DEFAULT 'default'
        CHECK (seed_mode IN ('default', 'ratio', 'never'));
    ALTER TABLE torrent_items ADD COLUMN seed_ratio REAL;
    "#,
];

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    prepare(conn)
}

#[cfg(test)]
pub fn open_in_memory() -> rusqlite::Result<Connection> {
    prepare(Connection::open_in_memory()?)
}

fn prepare(mut conn: Connection) -> rusqlite::Result<Connection> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", true)?;
    migrate(&mut conn)?;
    Ok(conn)
}

fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(current.max(0) as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", index as i64 + 1)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_run_once_and_set_the_version() {
        let mut conn = open_in_memory().unwrap();
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(version, MIGRATIONS.len() as i64);
        // a second run is a no-op
        migrate(&mut conn).unwrap();
        let tables: i64 = conn
            .query_row("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name LIKE 'player_%'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(tables, 4);
        let categories: i64 = conn.query_row("SELECT count(*) FROM torrent_categories", [], |r| r.get(0)).unwrap();
        assert_eq!(categories, 3, "Сериалы, Игры, Программы");
    }

    #[test]
    fn the_old_autoplay_switch_moves_into_the_settings() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(MIGRATIONS[0]).unwrap();
        conn.execute_batch(MIGRATIONS[1]).unwrap();
        conn.pragma_update(None, "user_version", 2).unwrap();
        conn.execute("INSERT INTO app_settings (key, value) VALUES ('player.autoplay', '0')", []).unwrap();
        migrate(&mut conn).unwrap();
        let rows: Vec<(String, String)> = conn
            .prepare("SELECT key, value FROM app_settings")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(rows, [("settings".to_string(), r#"{"autoplay":false}"#.to_string())]);
    }
}
