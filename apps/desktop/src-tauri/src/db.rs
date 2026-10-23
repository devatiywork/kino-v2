//! One SQLite database for the app (SPEC 7). Player tables are prefixed `player_`,
//! torrent tables will be `torrent_`; the two sections never reference each other.

use std::path::Path;

use rusqlite::Connection;

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
        assert_eq!(tables, 3);
    }
}
