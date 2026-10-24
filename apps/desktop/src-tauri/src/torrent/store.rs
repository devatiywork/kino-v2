//! The torrent archive in SQLite (SPEC 4.2, 4.4): categories, every torrent ever added with
//! its files. A record goes away only by «Удалить из архива». Knows nothing about the engine.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::db;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    /// Chosen by the user; None — `<downloads folder>\<name>`
    pub folder: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub index: usize,
    /// Inside the torrent, with `\` separators
    pub path: String,
    pub size: u64,
}

/// A record of the archive as the engine and the commands need it
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Item {
    pub id: i64,
    pub info_hash: String,
    pub name: String,
    pub total_size: u64,
    pub category_id: Option<i64>,
    pub save_dir: String,
    pub source_url: Option<String>,
    pub added_at: i64,
    pub completed_at: Option<i64>,
    pub in_downloads: bool,
    pub paused: bool,
    pub files_deleted: bool,
    pub only_files: Option<Vec<usize>>,
    pub uploaded: u64,
    pub file_count: usize,
    /// The first file: for a one-file torrent it is the whole content
    pub first_file: Option<String>,
}

impl Item {
    /// Where the content lies: a multi-file torrent has its own folder in `save_dir`
    pub fn content_path(&self) -> PathBuf {
        let dir = Path::new(&self.save_dir);
        match (&self.first_file, self.file_count) {
            (Some(file), 1) => dir.join(file),
            _ => dir.join(&self.name),
        }
    }

    /// What the engine writes into: the files' paths are relative to it
    pub fn output_folder(&self) -> PathBuf {
        if self.file_count > 1 {
            Path::new(&self.save_dir).join(&self.name)
        } else {
            PathBuf::from(&self.save_dir)
        }
    }
}

/// What a new record is made of (the add dialog)
pub struct NewItem<'a> {
    pub info_hash: &'a str,
    pub name: &'a str,
    pub category_id: Option<i64>,
    pub save_dir: &'a str,
    pub source_url: Option<&'a str>,
    pub files: &'a [FileEntry],
    pub only_files: Option<&'a [usize]>,
    pub paused: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("database: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("a category «{0}» already exists")]
    CategoryExists(String),
    #[error("empty category name")]
    EmptyName,
    #[error("the torrent is still in the downloads")]
    StillActive,
}

pub type StoreResult<T> = Result<T, StoreError>;

const ITEM_COLUMNS: &str = "i.id, i.info_hash, i.name, i.total_size, i.category_id, i.save_dir, i.source_url, i.added_at,
    i.completed_at, i.in_downloads, i.paused, i.files_deleted, i.only_files, i.uploaded,
    (SELECT count(*) FROM torrent_files f WHERE f.item_id = i.id),
    (SELECT f.path FROM torrent_files f WHERE f.item_id = i.id ORDER BY f.idx LIMIT 1)";

fn item_from_row(row: &Row) -> rusqlite::Result<Item> {
    let only_files: Option<String> = row.get(12)?;
    Ok(Item {
        id: row.get(0)?,
        info_hash: row.get(1)?,
        name: row.get(2)?,
        total_size: row.get::<_, i64>(3)? as u64,
        category_id: row.get(4)?,
        save_dir: row.get(5)?,
        source_url: row.get(6)?,
        added_at: row.get(7)?,
        completed_at: row.get(8)?,
        in_downloads: row.get(9)?,
        paused: row.get(10)?,
        files_deleted: row.get(11)?,
        only_files: only_files.and_then(|json| serde_json::from_str(&json).ok()),
        uploaded: row.get::<_, i64>(13)? as u64,
        file_count: row.get::<_, i64>(14)? as usize,
        first_file: row.get(15)?,
    })
}

fn search_text(name: &str, files: &[FileEntry]) -> String {
    let mut text = name.to_lowercase();
    for file in files {
        text.push('\n');
        text.push_str(&file.path.to_lowercase());
    }
    text
}

fn only_files_json(only_files: Option<&[usize]>) -> Option<String> {
    only_files.map(|files| serde_json::to_string(files).unwrap_or_else(|_| "[]".into()))
}

pub struct TorrentStore {
    conn: Mutex<Connection>,
}

impl TorrentStore {
    /// Its own connection to the app database (WAL): the torrents never share the player's
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

    pub fn categories(&self) -> StoreResult<Vec<Category>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT id, name, folder FROM torrent_categories ORDER BY position, id")?;
        let rows = stmt.query_map([], |r| Ok(Category { id: r.get(0)?, name: r.get(1)?, folder: r.get(2)? }))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    #[cfg(test)]
    pub fn category(&self, id: i64) -> StoreResult<Option<Category>> {
        Ok(self
            .conn()
            .query_row("SELECT id, name, folder FROM torrent_categories WHERE id = ?1", [id], |r| {
                Ok(Category { id: r.get(0)?, name: r.get(1)?, folder: r.get(2)? })
            })
            .optional()?)
    }

    fn check_name(&self, name: &str, except: Option<i64>) -> StoreResult<String> {
        let name = name.trim();
        if name.is_empty() {
            return Err(StoreError::EmptyName);
        }
        // In Rust: SQLite's NOCASE knows only Latin letters, «Фильмы» must equal «фильмы»
        let lower = name.to_lowercase();
        let taken = self.categories()?.into_iter().find(|c| c.name.to_lowercase() == lower).map(|c| c.id);
        match taken {
            Some(id) if Some(id) != except => Err(StoreError::CategoryExists(name.to_string())),
            _ => Ok(name.to_string()),
        }
    }

    pub fn create_category(&self, name: &str, folder: Option<&str>) -> StoreResult<Category> {
        let name = self.check_name(name, None)?;
        let folder = folder.map(str::trim).filter(|f| !f.is_empty());
        let id = self.conn().query_row(
            "INSERT INTO torrent_categories (name, folder, position)
             VALUES (?1, ?2, (SELECT COALESCE(MAX(position), 0) + 1 FROM torrent_categories)) RETURNING id",
            params![name, folder],
            |r| r.get(0),
        )?;
        Ok(Category { id, name, folder: folder.map(str::to_owned) })
    }

    pub fn update_category(&self, id: i64, name: &str, folder: Option<&str>) -> StoreResult<()> {
        let name = self.check_name(name, Some(id))?;
        let folder = folder.map(str::trim).filter(|f| !f.is_empty());
        self.conn().execute("UPDATE torrent_categories SET name = ?2, folder = ?3 WHERE id = ?1", params![id, name, folder])?;
        Ok(())
    }

    /// SPEC 4.2: its torrents go to «Без категории», nothing is lost
    pub fn delete_category(&self, id: i64) -> StoreResult<()> {
        self.conn().execute("DELETE FROM torrent_categories WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn item(&self, id: i64) -> StoreResult<Option<Item>> {
        let sql = format!("SELECT {ITEM_COLUMNS} FROM torrent_items i WHERE i.id = ?1");
        Ok(self.conn().query_row(&sql, [id], item_from_row).optional()?)
    }

    pub fn item_by_hash(&self, info_hash: &str) -> StoreResult<Option<Item>> {
        let sql = format!("SELECT {ITEM_COLUMNS} FROM torrent_items i WHERE i.info_hash = ?1");
        Ok(self.conn().query_row(&sql, [info_hash.to_lowercase()], item_from_row).optional()?)
    }

    pub fn insert(&self, new: &NewItem) -> StoreResult<Item> {
        let total: u64 = new.files.iter().map(|f| f.size).sum();
        let id = {
            let mut conn = self.conn();
            let tx = conn.transaction()?;
            let id: i64 = tx.query_row(
                "INSERT INTO torrent_items (info_hash, name, total_size, category_id, save_dir, source_url, added_at,
                    paused, only_files, search_text)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) RETURNING id",
                params![
                    new.info_hash.to_lowercase(),
                    new.name,
                    total as i64,
                    new.category_id,
                    new.save_dir,
                    new.source_url.filter(|u| !u.trim().is_empty()),
                    db::now_ms(),
                    new.paused,
                    only_files_json(new.only_files),
                    search_text(new.name, new.files),
                ],
                |r| r.get(0),
            )?;
            {
                let mut stmt = tx.prepare("INSERT INTO torrent_files (item_id, idx, path, size) VALUES (?1, ?2, ?3, ?4)")?;
                for file in new.files {
                    stmt.execute(params![id, file.index as i64, file.path, file.size as i64])?;
                }
            }
            tx.commit()?;
            id
        };
        Ok(self.item(id)?.expect("the inserted record"))
    }

    /// A record from a backup (SPEC 4.4): straight into the archive, with its old dates, ratio
    /// and «файлы удалены» — never into the downloads
    pub fn insert_archived(&self, new: &NewItem, added_at: i64, completed_at: Option<i64>, files_deleted: bool, uploaded: u64) -> StoreResult<Item> {
        let item = self.insert(new)?;
        self.conn().execute(
            "UPDATE torrent_items SET in_downloads = 0, paused = 0, added_at = ?2, completed_at = ?3, files_deleted = ?4, uploaded = ?5
             WHERE id = ?1",
            params![item.id, added_at, completed_at, files_deleted, uploaded as i64],
        )?;
        Ok(self.item(item.id)?.expect("the imported record"))
    }

    /// «Скачать снова» / «Снова раздавать»: the same record goes back to the downloads
    pub fn return_to_downloads(&self, id: i64, save_dir: &str, only_files: Option<&[usize]>, paused: bool, reset_completion: bool) -> StoreResult<()> {
        self.conn().execute(
            "UPDATE torrent_items SET in_downloads = 1, files_deleted = 0, save_dir = ?2, only_files = ?3, paused = ?4,
                completed_at = CASE WHEN ?5 THEN NULL ELSE completed_at END
             WHERE id = ?1",
            params![id, save_dir, only_files_json(only_files), paused, reset_completion],
        )?;
        Ok(())
    }

    /// «Убрать из загрузок» (`files_deleted` false) and «Удалить с файлами» (true); `uploaded` — of this run
    pub fn leave_downloads(&self, id: i64, files_deleted: bool, uploaded: u64) -> StoreResult<()> {
        self.conn().execute(
            "UPDATE torrent_items SET in_downloads = 0, paused = 0, files_deleted = MAX(files_deleted, ?2), uploaded = uploaded + ?3
             WHERE id = ?1",
            params![id, files_deleted, uploaded as i64],
        )?;
        Ok(())
    }

    pub fn add_uploaded(&self, id: i64, uploaded: u64) -> StoreResult<()> {
        self.conn().execute("UPDATE torrent_items SET uploaded = uploaded + ?2 WHERE id = ?1", params![id, uploaded as i64])?;
        Ok(())
    }

    pub fn set_paused(&self, id: i64, paused: bool) -> StoreResult<()> {
        self.conn().execute("UPDATE torrent_items SET paused = ?2 WHERE id = ?1", params![id, paused])?;
        Ok(())
    }

    pub fn set_completed(&self, id: i64, at: i64) -> StoreResult<()> {
        self.conn().execute("UPDATE torrent_items SET completed_at = ?2 WHERE id = ?1 AND completed_at IS NULL", params![id, at])?;
        Ok(())
    }

    pub fn set_category(&self, id: i64, category_id: Option<i64>) -> StoreResult<()> {
        self.conn().execute("UPDATE torrent_items SET category_id = ?2 WHERE id = ?1", params![id, category_id])?;
        Ok(())
    }

    pub fn set_source(&self, id: i64, url: Option<&str>) -> StoreResult<()> {
        let url = url.map(str::trim).filter(|u| !u.is_empty());
        self.conn().execute("UPDATE torrent_items SET source_url = ?2 WHERE id = ?1", params![id, url])?;
        Ok(())
    }

    pub fn set_only_files(&self, id: i64, only_files: Option<&[usize]>) -> StoreResult<()> {
        self.conn().execute("UPDATE torrent_items SET only_files = ?2 WHERE id = ?1", params![id, only_files_json(only_files)])?;
        Ok(())
    }

    /// What the engine must have: the records in the downloads
    pub fn in_downloads(&self) -> StoreResult<Vec<Item>> {
        let sql = format!("SELECT {ITEM_COLUMNS} FROM torrent_items i WHERE i.in_downloads = 1 ORDER BY i.added_at DESC");
        let conn = self.conn();
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], item_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// The archive, newest first; `query` — words of the name or of a file path, any case
    /// Every word of the query is somewhere in the name or the file paths: «kino test» finds
    /// «Kino.Test.S01» (release names have dots, not spaces)
    pub fn archive(&self, query: &str) -> StoreResult<Vec<Item>> {
        let words: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
        let filter: String = (1..=words.len()).map(|n| format!(" AND instr(i.search_text, ?{n}) > 0")).collect();
        let sql = format!("SELECT {ITEM_COLUMNS} FROM torrent_items i WHERE 1 = 1{filter} ORDER BY i.added_at DESC, i.id DESC");
        let conn = self.conn();
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(words.iter()), item_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn files(&self, id: i64) -> StoreResult<Vec<FileEntry>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT idx, path, size FROM torrent_files WHERE item_id = ?1 ORDER BY idx")?;
        let rows = stmt.query_map([id], |r| {
            Ok(FileEntry { index: r.get::<_, i64>(0)? as usize, path: r.get(1)?, size: r.get::<_, i64>(2)? as u64 })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// «Удалить из архива» — only for a record that is not in the downloads
    pub fn delete(&self, id: i64) -> StoreResult<()> {
        let active: Option<bool> = self
            .conn()
            .query_row("SELECT in_downloads FROM torrent_items WHERE id = ?1", [id], |r| r.get(0))
            .optional()?;
        if active == Some(true) {
            return Err(StoreError::StillActive);
        }
        self.conn().execute("DELETE FROM torrent_items WHERE id = ?1", [id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files(names: &[(&str, u64)]) -> Vec<FileEntry> {
        names.iter().enumerate().map(|(index, (path, size))| FileEntry { index, path: path.to_string(), size: *size }).collect()
    }

    fn season(store: &TorrentStore, hash: &str) -> Item {
        let files = files(&[("Peacemaker.S02E01.mkv", 4_000), ("Peacemaker.S02E02.mkv", 5_000), ("Subs\\Rus.srt", 10)]);
        store
            .insert(&NewItem {
                info_hash: hash,
                name: "Peacemaker.S02.2160p",
                category_id: Some(1),
                save_dir: r"D:\Сериалы",
                source_url: Some("https://rutracker.org/forum/viewtopic.php?t=1"),
                files: &files,
                only_files: Some(&[0, 1]),
                paused: false,
            })
            .unwrap()
    }

    #[test]
    fn base_categories_and_their_changes() {
        let store = TorrentStore::in_memory();
        let names: Vec<String> = store.categories().unwrap().into_iter().map(|c| c.name).collect();
        assert_eq!(names, ["Сериалы", "Игры", "Программы"]);

        let films = store.create_category("  Фильмы ", Some(r"E:\Кино")).unwrap();
        assert_eq!((films.name.as_str(), films.folder.as_deref()), ("Фильмы", Some(r"E:\Кино")));
        assert!(matches!(store.create_category("фильмы", None), Err(StoreError::CategoryExists(_))), "case does not matter");
        assert!(matches!(store.create_category("  ", None), Err(StoreError::EmptyName)));
        store.update_category(films.id, "Кино", None).unwrap();
        assert_eq!(store.category(films.id).unwrap().unwrap(), Category { id: films.id, name: "Кино".into(), folder: None });
    }

    #[test]
    fn a_record_keeps_its_files_and_hash_in_lower_case() {
        let store = TorrentStore::in_memory();
        let item = season(&store, "ABCDEF0123456789ABCDEF0123456789ABCDEF01");
        assert_eq!(item.info_hash, "abcdef0123456789abcdef0123456789abcdef01");
        assert_eq!((item.total_size, item.file_count, item.only_files.clone()), (9_010, 3, Some(vec![0, 1])));
        assert!(item.in_downloads && !item.paused && item.completed_at.is_none());
        assert_eq!(item.content_path(), PathBuf::from(r"D:\Сериалы\Peacemaker.S02.2160p"));
        assert_eq!(item.output_folder(), item.content_path(), "a multi-file torrent gets its own folder");
        assert_eq!(store.item_by_hash("ABCDEF0123456789ABCDEF0123456789ABCDEF01").unwrap().map(|i| i.id), Some(item.id));
        assert_eq!(store.files(item.id).unwrap()[2].path, "Subs\\Rus.srt");
    }

    #[test]
    fn one_file_lies_right_in_the_folder() {
        let store = TorrentStore::in_memory();
        let files = files(&[("ubuntu-26.04-desktop-amd64.iso", 6_000)]);
        let item = store
            .insert(&NewItem {
                info_hash: "1111111111111111111111111111111111111111",
                name: "ubuntu-26.04-desktop-amd64.iso",
                category_id: None,
                save_dir: r"D:\Загрузки",
                source_url: Some("  "),
                files: &files,
                only_files: None,
                paused: true,
            })
            .unwrap();
        assert_eq!(item.content_path(), PathBuf::from(r"D:\Загрузки\ubuntu-26.04-desktop-amd64.iso"));
        assert_eq!(item.output_folder(), PathBuf::from(r"D:\Загрузки"));
        assert_eq!(item.source_url, None, "a blank link is no link");
        assert!(item.paused);
    }

    #[test]
    fn leaving_the_downloads_keeps_the_record_and_the_ratio() {
        let store = TorrentStore::in_memory();
        let item = season(&store, "2222222222222222222222222222222222222222");
        assert!(matches!(store.delete(item.id), Err(StoreError::StillActive)), "first out of the downloads");

        store.set_completed(item.id, 100).unwrap();
        store.set_completed(item.id, 200).unwrap();
        store.leave_downloads(item.id, false, 3_000).unwrap();
        let left = store.item(item.id).unwrap().unwrap();
        assert_eq!((left.in_downloads, left.files_deleted, left.uploaded, left.completed_at), (false, false, 3_000, Some(100)));
        assert!(store.in_downloads().unwrap().is_empty());

        // «Скачать снова» after the files were deleted: the same record, completion starts over
        store.leave_downloads(item.id, true, 500).unwrap();
        store.return_to_downloads(item.id, r"E:\Другая", None, false, true).unwrap();
        let again = store.item(item.id).unwrap().unwrap();
        assert_eq!((again.in_downloads, again.files_deleted, again.save_dir.as_str()), (true, false, r"E:\Другая"));
        assert_eq!((again.uploaded, again.completed_at, again.only_files), (3_500, None, None));
        assert_eq!(store.archive("").unwrap().len(), 1, "never a second record");
    }

    #[test]
    fn archive_search_by_name_and_files_in_any_case() {
        let store = TorrentStore::in_memory();
        season(&store, "3333333333333333333333333333333333333333");
        assert_eq!(store.archive("PEACEMAKER").unwrap().len(), 1);
        assert_eq!(store.archive("rus.srt").unwrap().len(), 1, "a file inside");
        assert!(store.archive("goblin").unwrap().is_empty());
        assert_eq!(store.archive("peacemaker 2160p").unwrap().len(), 1, "every word, dots between them");
        assert!(store.archive("peacemaker goblin").unwrap().is_empty());
        let files = files(&[("Сезон 1\\Серия 1.mkv", 1)]);
        store
            .insert(&NewItem {
                info_hash: "4444444444444444444444444444444444444444",
                name: "Мастер и Маргарита",
                category_id: Some(1),
                save_dir: r"D:\Сериалы",
                source_url: None,
                files: &files,
                only_files: None,
                paused: false,
            })
            .unwrap();
        assert_eq!(store.archive("МАРГАРИТА").unwrap().len(), 1, "Cyrillic ignores case too");
        assert_eq!(store.archive("серия").unwrap()[0].name, "Мастер и Маргарита");
    }

    #[test]
    fn deleting_a_category_keeps_its_torrents() {
        let store = TorrentStore::in_memory();
        let item = season(&store, "5555555555555555555555555555555555555555");
        store.delete_category(1).unwrap();
        assert_eq!(store.item(item.id).unwrap().unwrap().category_id, None, "«Без категории»");
        store.leave_downloads(item.id, false, 0).unwrap();
        store.delete(item.id).unwrap();
        assert!(store.archive("").unwrap().is_empty());
        assert!(store.files(item.id).unwrap().is_empty(), "files go with the record");
    }
}
