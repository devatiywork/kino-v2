//! A torrent's parameters (SPEC 4.3 «Параметры торрента») that the engine allows: its seeding,
//! a full check of the files, moving them, a re-announce, the .torrent saved elsewhere. librqbit
//! has no per-torrent limits after the add, no priorities, no super-seeding: those are not here.

use std::path::Path;

use anyhow::Context;

use super::store::{Item, Seeding};
use super::Torrents;

/// A folder or a file to another place: a rename on the same disk, a copy and a delete across disks
pub fn move_path(from: &Path, to: &Path) -> std::io::Result<()> {
    if std::fs::rename(from, to).is_ok() {
        return Ok(());
    }
    copy_all(from, to)?;
    if from.is_dir() {
        std::fs::remove_dir_all(from)
    } else {
        std::fs::remove_file(from)
    }
}

fn copy_all(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            copy_all(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        std::fs::copy(from, to).map(|_| ())
    }
}

impl Torrents {
    /// «Раздача: как в настройках / до рейтинга / не раздавать»
    pub fn set_seeding(&self, id: i64, seeding: Seeding) -> anyhow::Result<()> {
        if let Seeding::Ratio { ratio } = seeding {
            anyhow::ensure!(ratio.is_finite() && ratio > 0.0, "the ratio must be above zero");
        }
        Ok(self.store.set_seeding(id, seeding)?)
    }

    /// Whether a torrent that has just finished seeds at all
    pub(super) fn seeds_after_download(&self, seeding: Seeding) -> bool {
        match seeding {
            Seeding::Default => !self.settings.read(|s| s.no_seeding),
            Seeding::Ratio { .. } => true,
            Seeding::Never => false,
        }
    }

    /// A seeding torrent has given enough: its own ratio is reached
    pub(super) fn seeded_enough(seeding: Seeding, ratio: f64) -> bool {
        matches!(seeding, Seeding::Ratio { ratio: wanted } if ratio >= wanted)
    }

    /// «Проверить файлы»: the engine forgets what it knew and checks every piece on disk
    pub async fn recheck(&self, id: i64) -> anyhow::Result<()> {
        let item = self.item(id)?;
        anyhow::ensure!(item.in_downloads, "the torrent is not in the downloads");
        // Removing a torrent drops its fast-resume state: the add checks everything again
        self.engine.remove(&item.info_hash, false).await?;
        self.start_item(&item).await
    }

    /// «Переобъявить»: the trackers, DHT and LSD are asked for peers again now
    pub async fn reannounce(&self, id: i64) -> anyhow::Result<()> {
        let item = self.item(id)?;
        self.engine.reannounce(&item.info_hash).await
    }

    /// «Переместить файлы»: the content goes into `folder`, the torrent goes on from there (its
    /// files are checked again). Works for a record of the archive too
    pub async fn move_to(&self, id: i64, folder: &str) -> anyhow::Result<()> {
        let item = self.item(id)?;
        let target = Path::new(folder);
        anyhow::ensure!(target.is_dir(), "not a folder: {folder}");
        let from = item.content_path();
        let to = target.join(from.file_name().context("no file name")?);
        if from == to {
            return Ok(());
        }
        anyhow::ensure!(!to.exists(), "there is already {}", to.display());
        if item.in_downloads {
            self.engine.remove(&item.info_hash, false).await?;
        }
        let moved = if from.exists() { move_path(&from, &to).with_context(|| format!("moving {}", from.display())) } else { Ok(()) };
        if moved.is_ok() {
            self.store.set_save_dir(id, folder)?;
        }
        if item.in_downloads {
            // Back into the engine from wherever the files are now
            self.start_item(&self.item(id)?).await?;
        }
        moved
    }

    /// «Сохранить .torrent»: the archive's copy into a file the user chose
    pub fn save_torrent_file(&self, id: i64, path: &Path) -> anyhow::Result<()> {
        let item = self.item(id)?;
        std::fs::write(path, self.stored_bytes(&item.info_hash)?)?;
        Ok(())
    }

    /// «Отдельная папка для недокачанного» from the settings; None — off
    pub(super) fn incomplete_folder(&self) -> Option<String> {
        Some(self.settings.read(|s| s.incomplete_folder.clone())).filter(|dir| !dir.is_empty())
    }

    /// «Удалять исходный .torrent после добавления»: the file the add dialog came from (the
    /// archive keeps its own copy)
    pub(super) fn delete_source(&self, info_hash: &str) {
        let Some(path) = super::lock(&self.sources).remove(info_hash) else { return };
        let is_torrent = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("torrent"));
        if is_torrent && self.settings.read(|s| s.delete_torrent_file) {
            if let Err(e) = std::fs::remove_file(&path) {
                eprintln!("[torrents] delete {}: {e}", path.display());
            }
        }
    }

    /// A torrent finished in the folder for unfinished torrents: it moves into its own and goes on
    /// from there (its files are checked once more). Should the move fail, it stays where it is
    pub(super) async fn move_into_place(&self, item: &Item) -> Item {
        let mut placed = item.clone();
        placed.incomplete_dir = None;
        let (from, to) = (item.content_path(), placed.content_path());
        let moved = async {
            self.engine.remove(&item.info_hash, false).await?;
            if from.exists() && from != to {
                anyhow::ensure!(!to.exists(), "there is already {}", to.display());
                if let Some(parent) = to.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                move_path(&from, &to)?;
            }
            self.store.set_incomplete(item.id, None)?;
            self.start_item(&placed).await
        };
        match moved.await {
            Ok(()) => placed,
            Err(e) => {
                eprintln!("[torrents] {} into its folder: {e:#}", item.name);
                if self.engine.torrent(&item.info_hash).is_none() {
                    if let Err(e) = self.start_item(item).await {
                        eprintln!("[torrents] {} back: {e:#}", item.name);
                    }
                }
                item.clone()
            }
        }
    }

    pub fn speed_history(&self, id: i64) -> Vec<[u64; 2]> {
        super::lock(&self.speeds).of(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moving_a_folder_keeps_every_file() {
        let root = std::env::temp_dir().join(format!("kino-move-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let from = root.join("a").join("Show.S01");
        std::fs::create_dir_all(from.join("Subs")).unwrap();
        std::fs::write(from.join("Show.S01E01.mkv"), b"video").unwrap();
        std::fs::write(from.join("Subs").join("ru.srt"), b"subs").unwrap();
        std::fs::create_dir_all(root.join("b")).unwrap();
        let to = root.join("b").join("Show.S01");
        move_path(&from, &to).unwrap();
        assert!(!from.exists());
        assert_eq!(std::fs::read(to.join("Subs").join("ru.srt")).unwrap(), b"subs");
        // copy_all is the cross-disk way: the same result
        copy_all(&to, &root.join("c")).unwrap();
        assert_eq!(std::fs::read(root.join("c").join("Show.S01E01.mkv")).unwrap(), b"video");
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_seeding_torrent_moves_to_another_folder_and_goes_on_from_there() {
        use std::sync::Arc;

        use crate::library::Library;
        use crate::settings::SettingsStore;
        use crate::torrent::{AddRequest, ArchiveStatus, PreviewSource, TorrentsOptions};

        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let root = std::env::temp_dir().join(format!("kino-move-engine-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            let (old, new) = (root.join("old"), root.join("new"));
            std::fs::create_dir_all(&old).unwrap();
            std::fs::create_dir_all(&new).unwrap();
            let film = old.join("Film.2014.mkv");
            std::fs::write(&film, (0..50_000).map(|i| (i % 251) as u8).collect::<Vec<_>>()).unwrap();
            let spawner = librqbit::spawn_utils::BlockingSpawner::new(1);
            let made = librqbit::create_torrent(&film, librqbit::CreateTorrentOptions { piece_length: Some(16_384), ..Default::default() }, &spawner)
                .await
                .unwrap();
            let file = root.join("film.torrent");
            std::fs::write(&file, made.as_bytes().unwrap()).unwrap();

            let settings = Arc::new(SettingsStore::load(Arc::new(Library::in_memory())));
            let torrents = Torrents::start(TorrentsOptions {
                db_path: root.join("kino.db"),
                dir: root.join("torrents"),
                system_downloads: root.join("downloads"),
                settings,
                offline: true,
            })
            .await
            .unwrap();
            let preview = torrents.preview(PreviewSource::File { path: file.to_string_lossy().into_owned() }).await.unwrap();
            let id = torrents
                .add(AddRequest {
                    info_hash: preview.info_hash,
                    category_id: None,
                    save_dir: old.to_string_lossy().into_owned(),
                    only_files: None,
                    source_url: None,
                    start: true,
                })
                .await
                .unwrap();

            torrents.move_to(id, &new.to_string_lossy()).await.unwrap();
            assert!(!film.exists() && new.join("Film.2014.mkv").exists(), "the file moved");
            let entry = torrents.archive("").unwrap().remove(0);
            assert_eq!((entry.save_dir.as_str(), entry.status), (new.to_string_lossy().as_ref(), ArchiveStatus::InDownloads));
            assert!(torrents.engine.torrent(&entry.info_hash).is_some(), "back in the engine");
            assert!(torrents.move_to(id, &root.join("nowhere").to_string_lossy()).await.is_err(), "not a folder");
            torrents.recheck(id).await.unwrap();
            assert!(torrents.engine.torrent(&entry.info_hash).is_some(), "checked again, still there");
            torrents.shutdown().await;
            let _ = std::fs::remove_dir_all(&root);
        });
    }

    #[test]
    fn a_torrent_downloads_into_the_unfinished_folder_and_moves_into_its_own() {
        use std::sync::Arc;

        use crate::library::Library;
        use crate::settings::SettingsStore;
        use crate::torrent::{AddRequest, ArchiveStatus, PreviewSource, TorrentsOptions};

        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let root = std::env::temp_dir().join(format!("kino-unfinished-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            let (unfinished, own) = (root.join("unfinished"), root.join("own"));
            std::fs::create_dir_all(&unfinished).unwrap();
            std::fs::create_dir_all(&own).unwrap();
            // Already «downloaded» into the unfinished folder: the check finishes it at once
            let film = unfinished.join("Film.2014.mkv");
            std::fs::write(&film, (0..50_000).map(|i| (i % 251) as u8).collect::<Vec<_>>()).unwrap();
            let spawner = librqbit::spawn_utils::BlockingSpawner::new(1);
            let made = librqbit::create_torrent(&film, librqbit::CreateTorrentOptions { piece_length: Some(16_384), ..Default::default() }, &spawner)
                .await
                .unwrap();
            let file = root.join("film.torrent");
            std::fs::write(&file, made.as_bytes().unwrap()).unwrap();

            let settings = Arc::new(SettingsStore::load(Arc::new(Library::in_memory())));
            let patch = serde_json::json!({ "incompleteFolder": unfinished.to_string_lossy(), "deleteTorrentFile": true });
            settings.update(patch.as_object().unwrap()).unwrap();
            let torrents = Torrents::start(TorrentsOptions {
                db_path: root.join("kino.db"),
                dir: root.join("torrents"),
                system_downloads: root.join("downloads"),
                settings,
                offline: true,
            })
            .await
            .unwrap();
            let preview = torrents.preview(PreviewSource::File { path: file.to_string_lossy().into_owned() }).await.unwrap();
            torrents
                .add(AddRequest {
                    info_hash: preview.info_hash,
                    category_id: None,
                    save_dir: own.to_string_lossy().into_owned(),
                    only_files: None,
                    source_url: None,
                    start: true,
                })
                .await
                .unwrap();
            assert!(!file.exists(), "«Удалять исходный .torrent» — the archive keeps its copy");

            let mut finished = Vec::new();
            for _ in 0..100 {
                finished.extend(torrents.tick().await.unwrap().finished);
                if !finished.is_empty() {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
            assert_eq!(finished.len(), 1, "finished");
            assert!(own.join("Film.2014.mkv").exists() && !film.exists(), "moved into its own folder");
            assert_eq!(finished[0].item.output_folder(), own, "the library links the files where they are now");
            let entry = torrents.archive("").unwrap().remove(0);
            assert_eq!((entry.content_path, entry.status), (own.join("Film.2014.mkv").to_string_lossy().into_owned(), ArchiveStatus::InDownloads));
            torrents.shutdown().await;
            let _ = std::fs::remove_dir_all(&root);
        });
    }

    #[test]
    fn seeding_rules() {
        assert!(Torrents::seeded_enough(Seeding::Ratio { ratio: 2.0 }, 2.0));
        assert!(!Torrents::seeded_enough(Seeding::Ratio { ratio: 2.0 }, 1.99));
        assert!(!Torrents::seeded_enough(Seeding::Default, 100.0), "the settings decide");
        assert!(!Torrents::seeded_enough(Seeding::Never, 100.0), "it never seeded");
    }
}
