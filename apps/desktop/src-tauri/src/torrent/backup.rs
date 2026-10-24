//! «Резервная копия» of the archive (SPEC 4.4): every record with its .torrent in one JSON file,
//! and back. A restore adds what the archive lacks (by info hash) and never changes what it has:
//! the same file can be restored twice, or into an archive that kept growing since.

use std::io::{BufReader, BufWriter, Write};
use std::path::Path;

use anyhow::Context;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use bytes::Bytes;
use serde::{Deserialize, Serialize};

use super::engine::read_torrent;
use super::store::NewItem;
use super::Torrents;
use crate::db::now_ms;

/// What the file says it is: not some other JSON
const KIND: &str = "kino-torrent-archive";
const VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    kind: String,
    version: u32,
    exported_at: i64,
    categories: Vec<BackupCategory>,
    items: Vec<BackupItem>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupCategory {
    name: String,
    /// Its own folder; None — inside the downloads folder
    folder: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupItem {
    info_hash: String,
    name: String,
    /// By name: the ids of another archive mean nothing here
    category: Option<String>,
    save_dir: String,
    source_url: Option<String>,
    added_at: i64,
    completed_at: Option<i64>,
    only_files: Option<Vec<usize>>,
    uploaded: u64,
    files_deleted: bool,
    /// The .torrent itself, base64
    torrent: String,
}

/// What a restore did
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreReport {
    pub added: usize,
    /// Already in the archive
    pub skipped: usize,
    /// A record without a readable .torrent
    pub broken: usize,
}

impl Torrents {
    /// The whole archive into `path`; returns how many records went there
    pub fn export_archive(&self, path: &Path) -> anyhow::Result<usize> {
        let categories = self.store.categories()?;
        let mut items = Vec::new();
        for item in self.store.archive("")? {
            let bytes = std::fs::read(self.torrent_file(&item.info_hash)).with_context(|| format!("the .torrent of {}", item.name))?;
            items.push(BackupItem {
                category: item.category_id.and_then(|id| categories.iter().find(|c| c.id == id)).map(|c| c.name.clone()),
                torrent: BASE64.encode(bytes),
                info_hash: item.info_hash,
                name: item.name,
                save_dir: item.save_dir,
                source_url: item.source_url,
                added_at: item.added_at,
                completed_at: item.completed_at,
                only_files: item.only_files,
                uploaded: item.uploaded,
                files_deleted: item.files_deleted,
            });
        }
        let backup = Backup {
            kind: KIND.into(),
            version: VERSION,
            exported_at: now_ms(),
            categories: categories.into_iter().map(|c| BackupCategory { name: c.name, folder: c.folder }).collect(),
            items,
        };
        // Written next to the target and moved over it: a failure never leaves half a file
        let partial = path.with_extension("partial");
        {
            let mut out = BufWriter::new(std::fs::File::create(&partial)?);
            serde_json::to_writer(&mut out, &backup)?;
            out.flush()?;
        }
        std::fs::rename(&partial, path)?;
        Ok(backup.items.len())
    }

    /// Records of a backup the archive does not have yet, with their categories
    pub fn restore_archive(&self, path: &Path) -> anyhow::Result<RestoreReport> {
        let backup: Backup =
            serde_json::from_reader(BufReader::new(std::fs::File::open(path)?)).context("not a backup of Kino's archive")?;
        anyhow::ensure!(backup.kind == KIND, "not a backup of Kino's archive");
        anyhow::ensure!(backup.version <= VERSION, "the backup is from a newer Kino");

        let mut categories = self.store.categories()?;
        let mut category_of = |name: &str, folder: Option<&str>| -> anyhow::Result<i64> {
            if let Some(known) = categories.iter().find(|c| c.name.to_lowercase() == name.to_lowercase()) {
                return Ok(known.id);
            }
            let made = self.store.create_category(name, folder)?;
            let id = made.id;
            categories.push(made);
            Ok(id)
        };

        let mut report = RestoreReport::default();
        for item in &backup.items {
            if self.store.item_by_hash(&item.info_hash)?.is_some() {
                report.skipped += 1;
                continue;
            }
            let meta = match BASE64.decode(&item.torrent).map_err(anyhow::Error::from).and_then(|b| read_torrent(Bytes::from(b))) {
                Ok(meta) if meta.info_hash.eq_ignore_ascii_case(&item.info_hash) => meta,
                Ok(_) | Err(_) => {
                    eprintln!("[torrents] restore {}: no readable .torrent", item.name);
                    report.broken += 1;
                    continue;
                }
            };
            let category_id = match &item.category {
                Some(name) => {
                    let folder = backup.categories.iter().find(|c| &c.name == name).and_then(|c| c.folder.as_deref());
                    Some(category_of(name, folder)?)
                }
                None => None,
            };
            std::fs::write(self.torrent_file(&meta.info_hash), &meta.torrent_bytes)?;
            self.store.insert_archived(
                &NewItem {
                    info_hash: &meta.info_hash,
                    name: &item.name,
                    category_id,
                    save_dir: &item.save_dir,
                    source_url: item.source_url.as_deref(),
                    files: &meta.files,
                    only_files: item.only_files.as_deref(),
                    paused: false,
                },
                item.added_at,
                item.completed_at,
                item.files_deleted,
                item.uploaded,
            )?;
            report.added += 1;
        }
        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use super::*;
    use crate::library::Library;
    use crate::settings::SettingsStore;
    use crate::torrent::{AddRequest, PreviewSource, TorrentsOptions};

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("kino-backup-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    async fn torrents(dir: &Path) -> Arc<Torrents> {
        let settings = Arc::new(SettingsStore::load(Arc::new(Library::in_memory())));
        Torrents::start(TorrentsOptions {
            db_path: dir.join("kino.db"),
            dir: dir.join("torrents"),
            system_downloads: dir.join("downloads"),
            settings,
            offline: true,
        })
        .await
        .unwrap()
    }

    /// A .torrent of a small real file in `dir`
    async fn torrent_file(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, (0..50_000).map(|i| (i % 251) as u8).collect::<Vec<_>>()).unwrap();
        let spawner = librqbit::spawn_utils::BlockingSpawner::new(1);
        let created = librqbit::create_torrent(&path, librqbit::CreateTorrentOptions { piece_length: Some(16_384), ..Default::default() }, &spawner)
            .await
            .unwrap();
        let file = dir.join(format!("{name}.torrent"));
        std::fs::write(&file, created.as_bytes().unwrap()).unwrap();
        file
    }

    #[test]
    fn the_archive_goes_into_a_file_and_comes_back_once() {
        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let home = temp("home");
            let first = torrents(&home).await;
            let films = first.store().create_category("Фильмы", Some(r"F:\Video")).unwrap();
            let file = torrent_file(&home, "Film.2014.mkv").await;
            let preview = first.preview(PreviewSource::File { path: file.to_string_lossy().into_owned() }).await.unwrap();
            first
                .add(AddRequest {
                    info_hash: preview.info_hash.clone(),
                    category_id: Some(films.id),
                    save_dir: home.to_string_lossy().into_owned(),
                    only_files: None,
                    source_url: Some("https://rutor.info/torrent/1".into()),
                    start: false,
                })
                .await
                .unwrap();
            let backup = home.join("archive.kino.json");
            assert_eq!(first.export_archive(&backup).unwrap(), 1);
            first.shutdown().await;

            // Another computer: the record, its category (with its folder) and its .torrent come back
            let laptop = temp("laptop");
            let second = torrents(&laptop).await;
            assert_eq!(second.restore_archive(&backup).unwrap(), RestoreReport { added: 1, skipped: 0, broken: 0 });
            let restored = second.archive("").unwrap();
            assert_eq!(restored.len(), 1);
            let entry = &restored[0];
            assert_eq!((entry.name.as_str(), entry.source_url.as_deref()), ("Film.2014.mkv", Some("https://rutor.info/torrent/1")));
            assert!(matches!(entry.status, crate::torrent::ArchiveStatus::OnDisk | crate::torrent::ArchiveStatus::FilesDeleted), "never in the downloads");
            let category = second.store().categories().unwrap().into_iter().find(|c| Some(c.id) == entry.category_id).unwrap();
            assert_eq!((category.name.as_str(), category.folder.as_deref()), ("Фильмы", Some(r"F:\Video")));
            assert!(second.magnet(entry.id).unwrap().contains(&preview.info_hash), "its .torrent is there");

            // Restoring again adds nothing
            assert_eq!(second.restore_archive(&backup).unwrap(), RestoreReport { added: 0, skipped: 1, broken: 0 });
            assert_eq!(second.store().categories().unwrap().len(), 4, "no second «Фильмы»");
            second.shutdown().await;

            std::fs::write(laptop.join("other.json"), br#"{"hello": 1}"#).unwrap();
            assert!(torrents(&temp("other")).await.restore_archive(&laptop.join("other.json")).is_err(), "not a backup");
            let _ = std::fs::remove_dir_all(&home);
            let _ = std::fs::remove_dir_all(&laptop);
        });
    }
}
