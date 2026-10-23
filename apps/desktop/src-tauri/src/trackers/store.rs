//! Bookmarks of the trackers browser (SPEC 4.5): added, renamed, deleted and reordered

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::db;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub id: i64,
    pub title: String,
    pub url: String,
}

pub struct BookmarkStore {
    conn: Mutex<Connection>,
}

impl BookmarkStore {
    pub fn open(db_path: &Path) -> rusqlite::Result<Self> {
        Ok(Self { conn: Mutex::new(db::open(db_path)?) })
    }

    #[cfg(test)]
    pub fn in_memory() -> Self {
        Self { conn: Mutex::new(db::open_in_memory().unwrap()) }
    }

    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn list(&self) -> rusqlite::Result<Vec<Bookmark>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, title, url FROM torrent_bookmarks ORDER BY position, id")?;
        let rows = stmt.query_map([], |r| Ok(Bookmark { id: r.get(0)?, title: r.get(1)?, url: r.get(2)? }))?;
        rows.collect()
    }

    pub fn create(&self, title: &str, url: &str) -> rusqlite::Result<Bookmark> {
        let id = self.conn().query_row(
            "INSERT INTO torrent_bookmarks (title, url, position)
             VALUES (?1, ?2, (SELECT COALESCE(MAX(position), 0) + 1 FROM torrent_bookmarks)) RETURNING id",
            params![title, url],
            |r| r.get(0),
        )?;
        Ok(Bookmark { id, title: title.to_string(), url: url.to_string() })
    }

    pub fn update(&self, id: i64, title: &str, url: &str) -> rusqlite::Result<()> {
        self.conn().execute("UPDATE torrent_bookmarks SET title = ?2, url = ?3 WHERE id = ?1", params![id, title, url])?;
        Ok(())
    }

    pub fn delete(&self, id: i64) -> rusqlite::Result<()> {
        self.conn().execute("DELETE FROM torrent_bookmarks WHERE id = ?1", [id])?;
        Ok(())
    }

    /// One place up (`step` −1) or down (+1); the order is renumbered 1…n
    pub fn shift(&self, id: i64, step: i32) -> rusqlite::Result<()> {
        let mut ids: Vec<i64> = self.list()?.into_iter().map(|b| b.id).collect();
        let Some(at) = ids.iter().position(|&x| x == id) else { return Ok(()) };
        let to = (at as i64 + i64::from(step)).clamp(0, ids.len() as i64 - 1) as usize;
        ids.swap(at, to);
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        for (index, id) in ids.iter().enumerate() {
            tx.execute("UPDATE torrent_bookmarks SET position = ?2 WHERE id = ?1", params![id, index as i64 + 1])?;
        }
        tx.commit()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn titles(store: &BookmarkStore) -> Vec<String> {
        store.list().unwrap().into_iter().map(|b| b.title).collect()
    }

    #[test]
    fn rutracker_and_rutor_are_there_from_the_start() {
        let store = BookmarkStore::in_memory();
        let list = store.list().unwrap();
        assert_eq!(titles(&store), ["Рутрекер", "RuTor"]);
        assert_eq!(list[0].url, "https://rutracker.org/forum/index.php");
    }

    #[test]
    fn add_rename_reorder_delete() {
        let store = BookmarkStore::in_memory();
        let kinozal = store.create("Кинозал", "https://kinozal.tv/").unwrap();
        assert_eq!(titles(&store), ["Рутрекер", "RuTor", "Кинозал"]);
        store.shift(kinozal.id, -1).unwrap();
        assert_eq!(titles(&store), ["Рутрекер", "Кинозал", "RuTor"]);
        store.shift(kinozal.id, -1).unwrap();
        store.shift(kinozal.id, -1).unwrap();
        assert_eq!(titles(&store), ["Кинозал", "Рутрекер", "RuTor"], "the top stays the top");
        store.update(kinozal.id, "Kinozal", "https://kinozal.guru/").unwrap();
        assert_eq!(store.list().unwrap()[0], Bookmark { id: kinozal.id, title: "Kinozal".into(), url: "https://kinozal.guru/".into() });
        store.delete(kinozal.id).unwrap();
        assert_eq!(titles(&store), ["Рутрекер", "RuTor"]);
    }
}
