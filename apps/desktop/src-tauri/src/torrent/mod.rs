//! Torrents (SPEC 4): the engine, the archive and what the renderer sees of them. Knows nothing
//! about the player: «Смотреть» only hands a file path to the renderer.

pub mod backup;
pub mod commands;
pub mod engine;
pub mod manage;
mod policy;
mod speeds;
pub mod store;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use anyhow::Context;
use bytes::Bytes;
use librqbit::TorrentStatsState;
use serde::{Deserialize, Serialize};

use crate::db::now_ms;
use crate::power::KeepAwake;
use crate::settings::SettingsStore;
use engine::{Engine, EngineOptions, Metainfo, Network};
use store::{Category, FileEntry, Item, NewItem, Seeding, TorrentStore};

/// A magnet's metadata comes from the peers: no answer in this time — say so
const MAGNET_TIMEOUT: Duration = Duration::from_secs(90);

const VIDEO_EXTENSIONS: &[&str] = &["mkv", "mp4", "avi", "ts", "m2ts", "mov", "webm", "wmv", "m4v", "mpg", "mpeg", "flv"];

fn is_video(path: &str) -> bool {
    Path::new(path).extension().and_then(|e| e.to_str()).is_some_and(|e| VIDEO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
}

/// Where a torrent's files go: a multi-file torrent gets its own folder (like qBittorrent)
fn output_folder(save_dir: &str, name: &str, file_count: usize) -> PathBuf {
    if file_count > 1 {
        Path::new(save_dir).join(name)
    } else {
        PathBuf::from(save_dir)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TorrentState {
    /// The files on disk are being checked
    Checking,
    Downloading,
    Seeding,
    Paused,
    /// «Очередь»: waits on pause for a free place (SPEC 6)
    Queued,
    Error,
}

/// A torrent of the downloads list (SPEC 4.3)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTorrent {
    pub id: i64,
    pub info_hash: String,
    pub name: String,
    pub category_id: Option<i64>,
    pub state: TorrentState,
    pub error: Option<String>,
    /// 0…1 of the chosen files
    pub progress: f64,
    /// Bytes of the chosen files, and how many of them are here
    pub size: u64,
    pub done: u64,
    pub total_size: u64,
    pub file_count: usize,
    /// Bytes per second
    pub download_speed: u64,
    pub upload_speed: u64,
    /// Seconds left at the current speed
    pub eta: Option<u64>,
    /// Over all runs
    pub uploaded: u64,
    pub ratio: f64,
    /// Connected now, and known
    pub peers: u32,
    pub peers_seen: u32,
    pub save_dir: String,
    pub content_path: String,
    pub source_url: Option<String>,
    pub added_at: i64,
    pub completed_at: Option<i64>,
    /// A fully downloaded video file: «Смотреть» (SPEC 5)
    pub video: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentsUpdate {
    pub torrents: Vec<ActiveTorrent>,
    pub download_speed: u64,
    pub upload_speed: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ArchiveStatus {
    InDownloads,
    /// «Файлы на диске»
    OnDisk,
    /// «Файлы удалены» — by Kino or by hand
    FilesDeleted,
}

/// A torrent that has just finished: all its files are on disk; `archived` — it went to the
/// archive at once («Не раздавать после загрузки»)
#[derive(Debug, Clone)]
pub struct Finished {
    pub item: Item,
    pub archived: bool,
}

/// What a second of the update loop brought
#[derive(Debug, Default)]
pub struct Tick {
    pub update: TorrentsUpdate,
    pub finished: Vec<Finished>,
    /// Torrents that reached their ratio and went to the archive: name, ratio
    pub seeded: Vec<(String, f64)>,
    /// The schedule turned the alternative limits on or off
    pub settings_changed: bool,
}

/// A record of the archive (SPEC 4.4)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntry {
    pub id: i64,
    pub info_hash: String,
    pub name: String,
    pub total_size: u64,
    pub file_count: usize,
    pub category_id: Option<i64>,
    pub save_dir: String,
    pub content_path: String,
    pub source_url: Option<String>,
    pub added_at: i64,
    pub completed_at: Option<i64>,
    pub status: ArchiveStatus,
    pub uploaded: u64,
}

impl ArchiveEntry {
    fn of(item: &Item) -> Self {
        let content = item.content_path();
        let status = if item.in_downloads {
            ArchiveStatus::InDownloads
        } else if item.files_deleted || !content.exists() {
            ArchiveStatus::FilesDeleted
        } else {
            ArchiveStatus::OnDisk
        };
        Self {
            id: item.id,
            info_hash: item.info_hash.clone(),
            name: item.name.clone(),
            total_size: item.total_size,
            file_count: item.file_count,
            category_id: item.category_id,
            save_dir: item.save_dir.clone(),
            content_path: content.to_string_lossy().into_owned(),
            source_url: item.source_url.clone(),
            added_at: item.added_at,
            completed_at: item.completed_at,
            status,
            uploaded: item.uploaded,
        }
    }
}

/// A category with the folder its downloads go to
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryView {
    pub id: i64,
    pub name: String,
    pub folder: String,
    /// The folder was chosen; otherwise `<downloads folder>\<name>`
    pub custom_folder: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum PreviewSource {
    File { path: String },
    Magnet { uri: String },
}

/// The add dialog (SPEC 4.1): what the torrent is and whether the archive knows it
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub info_hash: String,
    pub name: String,
    pub total_size: u64,
    pub files: Vec<FileEntry>,
    /// «Уже в архиве» — the same hash was added before
    pub duplicate: Option<ArchiveEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRequest {
    pub info_hash: String,
    pub category_id: Option<i64>,
    pub save_dir: String,
    /// None — every file
    pub only_files: Option<Vec<usize>>,
    pub source_url: Option<String>,
    pub start: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileProgress {
    pub index: usize,
    pub path: String,
    pub size: u64,
    pub done: u64,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerView {
    pub address: String,
    pub connection: String,
    pub client: Option<String>,
    pub downloaded: u64,
    pub uploaded: u64,
    /// Bytes per second, from the counters a second ago
    pub download_speed: u64,
    pub upload_speed: u64,
}

/// Where else peers come from; a private torrent asks its trackers only
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Discovery {
    pub dht: bool,
    pub pex: bool,
    pub lsd: bool,
}

/// The details panel (SPEC 4.3): what changes is read again every second
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDetails {
    pub files: Vec<FileProgress>,
    pub peers: Vec<PeerView>,
    pub trackers: Vec<String>,
    pub comment: Option<String>,
    pub created_by: Option<String>,
    /// Unix ms
    pub created_at: Option<i64>,
    pub private: bool,
    pub piece_size: u64,
    pub pieces: u64,
    pub magnet: String,
    /// «Скачано»: the pieces on disk in up to 300 parts, 0…255 each; empty — not checked yet
    pub piece_map: Vec<u8>,
    /// Connected peers and all the peers known
    pub peers_live: u32,
    pub peers_seen: u32,
    /// Fetched but thrown away (failed checks, duplicates)
    pub lost: u64,
    pub discovery: Discovery,
    pub seeding: Seeding,
}

pub struct TorrentsOptions {
    pub db_path: PathBuf,
    /// `<data>\torrents`: the archive's .torrent files and the engine's state
    pub dir: PathBuf,
    /// The system Downloads folder: the default when the settings name none
    pub system_downloads: PathBuf,
    pub settings: Arc<SettingsStore>,
    pub offline: bool,
}

pub struct Torrents {
    store: TorrentStore,
    engine: Engine,
    files_dir: PathBuf,
    system_downloads: PathBuf,
    settings: Arc<SettingsStore>,
    /// Waiting for «Добавить»: the dialog shows them, the add takes them
    pending: Mutex<HashMap<String, Metainfo>>,
    /// Files of the records in the downloads (they never change)
    files: Mutex<HashMap<i64, Vec<FileEntry>>>,
    /// «Не засыпать во время загрузок»
    awake: KeepAwake,
    /// Tests: no DHT, LSD or trackers
    offline: bool,
    speeds: Mutex<speeds::SpeedHistory>,
    peer_speeds: Mutex<speeds::PeerSpeeds>,
    /// The .torrent files the add dialog came from: «Удалять исходный .torrent после добавления»
    sources: Mutex<HashMap<String, PathBuf>>,
    /// The limits given to the engine last: (download, upload) KB/s, and whether they are the alternative ones
    applied_limits: Mutex<Option<(u32, u32)>>,
    /// Inside the schedule of the alternative limits at the last tick; None — no schedule
    schedule_was: Mutex<Option<bool>>,
    /// Waiting in the queue: paused by Kino, not by the user
    queued: Mutex<std::collections::HashSet<i64>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Torrents {
    pub async fn start(options: TorrentsOptions) -> anyhow::Result<Arc<Self>> {
        let files_dir = options.dir.join("files");
        std::fs::create_dir_all(&files_dir)?;
        let (download_kbps, upload_kbps) = options.settings.read(|s| (s.download_limit, s.upload_limit));
        let engine_options = |network: Network| EngineOptions {
            state_dir: options.dir.join("engine"),
            default_folder: options.system_downloads.clone(),
            offline: options.offline,
            download_kbps,
            upload_kbps,
            network,
        };
        let network = options.settings.read(|s| Network {
            port: s.listen_port,
            upnp: s.upnp,
            protocol: s.protocol,
            peer_limit: s.peer_limit,
            proxy: s.proxy.clone(),
            dht: s.dht,
            lsd: s.lsd,
        });
        // A port taken by another program or a dead proxy must not keep Kino from starting
        let engine = match Engine::start(engine_options(network.clone())).await {
            Ok(engine) => engine,
            Err(e) if network != Network::default() => {
                eprintln!("[torrents] the engine with the connection settings: {e:#}; starting with the defaults");
                Engine::start(engine_options(Network::default())).await?
            }
            Err(e) => return Err(e),
        };
        let torrents = Arc::new(Self {
            store: TorrentStore::open(&options.db_path)?,
            engine,
            files_dir,
            system_downloads: options.system_downloads,
            settings: options.settings,
            pending: Mutex::default(),
            files: Mutex::default(),
            awake: KeepAwake::for_downloads(),
            offline: options.offline,
            speeds: Mutex::default(),
            peer_speeds: Mutex::default(),
            sources: Mutex::default(),
            applied_limits: Mutex::default(),
            schedule_was: Mutex::default(),
            queued: Mutex::default(),
        });
        torrents.reconcile().await?;
        Ok(torrents)
    }

    /// The engine has exactly the records in the downloads: extras leave it (their files stay),
    /// missing ones are added again from the archive's .torrent
    async fn reconcile(&self) -> anyhow::Result<()> {
        let wanted = self.store.in_downloads()?;
        for hash in self.engine.hashes() {
            if !wanted.iter().any(|item| item.info_hash == hash) {
                self.engine.remove(&hash, false).await?;
            }
        }
        let present = self.engine.hashes();
        for item in wanted.iter().filter(|item| !present.contains(&item.info_hash)) {
            if let Err(e) = self.start_item(item).await {
                eprintln!("[torrents] resume {}: {e:#}", item.name);
            }
        }
        Ok(())
    }

    fn torrent_file(&self, info_hash: &str) -> PathBuf {
        self.files_dir.join(format!("{info_hash}.torrent"))
    }

    fn stored_bytes(&self, info_hash: &str) -> anyhow::Result<Bytes> {
        Ok(Bytes::from(std::fs::read(self.torrent_file(info_hash)).context("the archive's .torrent file is missing")?))
    }

    async fn start_item(&self, item: &Item) -> anyhow::Result<()> {
        let bytes = self.stored_bytes(&item.info_hash)?;
        self.engine.add(bytes, &item.output_folder(), item.only_files.clone(), item.paused, self.extra_trackers()).await
    }

    fn item(&self, id: i64) -> anyhow::Result<Item> {
        self.store.item(id)?.context("no such torrent")
    }

    // ---------- folders and categories ----------

    /// «Папка по умолчанию»: from the settings, otherwise the system Downloads
    pub fn downloads_folder(&self) -> PathBuf {
        let chosen = self.settings.read(|s| s.downloads_folder.trim().to_string());
        if chosen.is_empty() {
            self.system_downloads.clone()
        } else {
            PathBuf::from(chosen)
        }
    }

    fn category_view(&self, category: Category) -> CategoryView {
        let folder = match &category.folder {
            Some(folder) => PathBuf::from(folder),
            None => self.downloads_folder().join(&category.name),
        };
        CategoryView {
            id: category.id,
            custom_folder: category.folder.is_some(),
            name: category.name,
            folder: folder.to_string_lossy().into_owned(),
        }
    }

    pub fn categories(&self) -> anyhow::Result<Vec<CategoryView>> {
        Ok(self.store.categories()?.into_iter().map(|c| self.category_view(c)).collect())
    }

    pub fn store(&self) -> &TorrentStore {
        &self.store
    }

    // ---------- adding ----------

    /// Reads a .torrent or resolves a magnet; the result waits for `add`
    pub async fn preview(&self, source: PreviewSource) -> anyhow::Result<Preview> {
        let meta = match source {
            PreviewSource::File { path } => {
                let meta = engine::read_torrent(Bytes::from(std::fs::read(&path).with_context(|| format!("cannot read {path}"))?))?;
                lock(&self.sources).insert(meta.info_hash.clone(), PathBuf::from(path));
                meta
            }
            PreviewSource::Magnet { uri } => {
                let hash = engine::magnet_hash(&uri)?;
                // The archive already has its .torrent: no need to ask the peers
                match self.stored_bytes(&hash) {
                    Ok(bytes) => engine::read_torrent(bytes)?,
                    Err(_) => tokio::time::timeout(MAGNET_TIMEOUT, self.engine.resolve_magnet(&uri))
                        .await
                        .context("the peers did not send the torrent's description in time")??,
                }
            }
        };
        let duplicate = self.store.item_by_hash(&meta.info_hash)?.map(|item| ArchiveEntry::of(&item));
        let preview = Preview {
            info_hash: meta.info_hash.clone(),
            name: meta.name.clone(),
            total_size: meta.files.iter().map(|f| f.size).sum(),
            files: meta.files.clone(),
            duplicate,
        };
        lock(&self.pending).insert(meta.info_hash.clone(), meta);
        Ok(preview)
    }

    /// «Добавить»: into the archive and into the engine. The .torrent is kept inside Kino
    pub async fn add(&self, request: AddRequest) -> anyhow::Result<i64> {
        let hash = request.info_hash.to_lowercase();
        anyhow::ensure!(self.store.item_by_hash(&hash)?.is_none(), "this torrent is already in the archive");
        let meta = lock(&self.pending).remove(&hash).context("open the torrent again")?;
        let only_files = request.only_files.filter(|chosen| chosen.len() < meta.files.len());
        std::fs::write(self.torrent_file(&hash), &meta.torrent_bytes)?;
        let incomplete = self.incomplete_folder();
        let output = output_folder(incomplete.as_deref().unwrap_or(&request.save_dir), &meta.name, meta.files.len());
        self.engine.add(meta.torrent_bytes.clone(), &output, only_files.clone(), !request.start, self.extra_trackers()).await?;
        let item = self.store.insert(&NewItem {
            info_hash: &hash,
            name: &meta.name,
            category_id: request.category_id,
            save_dir: &request.save_dir,
            source_url: request.source_url.as_deref(),
            files: &meta.files,
            only_files: only_files.as_deref(),
            paused: !request.start,
            incomplete_dir: incomplete.as_deref(),
        });
        match item {
            Ok(item) => {
                self.delete_source(&hash);
                Ok(item.id)
            }
            Err(e) => {
                if let Err(remove) = self.engine.remove(&hash, false).await {
                    eprintln!("[torrents] undo add: {remove:#}");
                }
                Err(e.into())
            }
        }
    }

    // ---------- the downloads ----------

    fn files_of(&self, id: i64) -> Vec<FileEntry> {
        let mut cache = lock(&self.files);
        if let Some(files) = cache.get(&id) {
            return files.clone();
        }
        let files = self.store.files(id).unwrap_or_default();
        cache.insert(id, files.clone());
        files
    }

    fn active_row(&self, item: &Item) -> ActiveTorrent {
        let stats = self.engine.stats(&item.info_hash);
        let files = self.files_of(item.id);
        let (state, error) = match &stats {
            None => (TorrentState::Error, Some("not in the engine".to_string())),
            Some(s) => match s.state {
                TorrentStatsState::Initializing { .. } => (TorrentState::Checking, None),
                TorrentStatsState::Paused => (TorrentState::Paused, None),
                TorrentStatsState::Error => (TorrentState::Error, s.error.clone()),
                TorrentStatsState::Live if s.finished => (TorrentState::Seeding, None),
                TorrentStatsState::Live => (TorrentState::Downloading, None),
            },
        };
        let state = self.queued_state(item.id, state);
        let size = stats.as_ref().map_or(item.total_size, |s| s.total_bytes);
        let done = stats.as_ref().map_or(0, |s| s.progress_bytes);
        let live = stats.as_ref().and_then(|s| s.live.as_ref());
        let to_bps = |mbps: f64| (mbps * 1024.0 * 1024.0) as u64;
        let download_speed = live.map_or(0, |l| to_bps(l.download_speed.mbps));
        let upload_speed = live.map_or(0, |l| to_bps(l.upload_speed.mbps));
        let uploaded = item.uploaded + live.map_or(0, |l| l.snapshot.uploaded_bytes);
        let eta = (state == TorrentState::Downloading && download_speed > 0).then(|| size.saturating_sub(done) / download_speed);
        let output = item.output_folder();
        let video = stats.as_ref().and_then(|s| {
            files
                .iter()
                .find(|f| is_video(&f.path) && s.file_progress.get(f.index).is_some_and(|&got| got >= f.size))
                .map(|f| output.join(&f.path).to_string_lossy().into_owned())
        });
        ActiveTorrent {
            id: item.id,
            info_hash: item.info_hash.clone(),
            name: item.name.clone(),
            category_id: item.category_id,
            state,
            error,
            progress: if size > 0 { done as f64 / size as f64 } else { 0.0 },
            size,
            done,
            total_size: item.total_size,
            file_count: item.file_count,
            download_speed,
            upload_speed,
            eta,
            uploaded,
            ratio: if done > 0 { uploaded as f64 / done as f64 } else { 0.0 },
            peers: live.map_or(0, |l| l.snapshot.peer_stats.live),
            peers_seen: live.map_or(0, |l| l.snapshot.peer_stats.seen),
            save_dir: item.save_dir.clone(),
            content_path: item.content_path().to_string_lossy().into_owned(),
            source_url: item.source_url.clone(),
            added_at: item.added_at,
            completed_at: item.completed_at,
            video,
        }
    }

    /// The downloads with live numbers — only reads
    pub fn snapshot(&self) -> anyhow::Result<TorrentsUpdate> {
        let torrents: Vec<ActiveTorrent> = self.store.in_downloads()?.iter().map(|item| self.active_row(item)).collect();
        let download_speed = torrents.iter().map(|t| t.download_speed).sum();
        let upload_speed = torrents.iter().map(|t| t.upload_speed).sum();
        Ok(TorrentsUpdate { torrents, download_speed, upload_speed })
    }

    /// The update loop's step, the only place where torrents finish: a finished torrent gets
    /// its completion date; with «Не раздавать после загрузки» it goes to the archive at once
    /// (SPEC 4.3). Returns the list and the names that finished just now (and whether they
    /// went to the archive) — exactly once each
    pub async fn tick(&self) -> anyhow::Result<Tick> {
        let mut tick = Tick::default();
        let items = self.store.in_downloads()?;
        self.apply_queue(&items).await?;
        let mut seeders = Vec::new();
        for item in items {
            let row = self.active_row(&item);
            if item.completed_at.is_some() {
                // Seeding until its own ratio (SPEC 4.3 «Параметры торрента»), or by the settings' rules
                if row.state == TorrentState::Seeding {
                    if Self::seeded_enough(item.seeding, row.ratio) {
                        self.leave(&item, false).await?;
                        tick.seeded.push((item.name.clone(), row.ratio));
                    } else {
                        seeders.push((item, row));
                    }
                }
                continue;
            }
            if row.state != TorrentState::Seeding {
                continue;
            }
            self.store.set_completed(item.id, now_ms())?;
            // Out of the folder for unfinished torrents into its own
            let item = if item.incomplete_dir.is_some() { self.move_into_place(&item).await } else { item };
            let archived = !self.seeds_after_download(item.seeding);
            if archived {
                self.leave(&item, false).await?;
            }
            tick.finished.push(Finished { item, archived });
        }
        tick.seeded.extend(self.apply_seed_limits(&seeders).await?);
        tick.settings_changed = self.follow_schedule()?;
        self.refresh_limits();
        let update = self.snapshot()?;
        lock(&self.speeds).record(update.torrents.iter().map(|t| (t.id, t.download_speed, t.upload_speed)));
        let downloading = update.torrents.iter().any(|t| t.state == TorrentState::Downloading);
        self.awake.set(downloading && self.settings.read(|s| s.keep_awake_downloads));
        tick.update = update;
        Ok(tick)
    }

    /// Something downloads or seeds: closing the window hides Kino in the tray (SPEC 4.6)
    pub fn busy(&self) -> bool {
        self.store.in_downloads().map(|items| items.iter().any(|i| !i.paused)).unwrap_or(false)
    }

    /// The files a record downloads (all, or the chosen ones): where each lies and its path
    /// inside the torrent
    pub fn content_files(&self, item: &Item) -> anyhow::Result<Vec<(PathBuf, String)>> {
        let out = item.output_folder();
        Ok(self
            .store
            .files(item.id)?
            .into_iter()
            .filter(|f| item.only_files.as_ref().is_none_or(|only| only.contains(&f.index)))
            .map(|f| (out.join(&f.path), f.path))
            .collect())
    }

    /// The archive's record of a torrent, by its info hash
    pub fn entry_by_hash(&self, info_hash: &str) -> anyhow::Result<Option<ArchiveEntry>> {
        Ok(self.store.item_by_hash(info_hash)?.as_ref().map(ArchiveEntry::of))
    }

    /// Uploaded in this run of the engine: the counter starts over after a pause and a restart
    fn uploaded_now(&self, item: &Item) -> u64 {
        self.engine.stats(&item.info_hash).and_then(|s| s.live.map(|l| l.snapshot.uploaded_bytes)).unwrap_or(0)
    }

    pub async fn pause(&self, id: i64) -> anyhow::Result<()> {
        let item = self.item(id)?;
        self.store.add_uploaded(id, self.uploaded_now(&item))?;
        self.engine.pause(&item.info_hash).await?;
        self.store.set_paused(id, true)?;
        Ok(())
    }

    pub async fn resume(&self, id: i64) -> anyhow::Result<()> {
        let item = self.item(id)?;
        self.engine.resume(&item.info_hash).await?;
        self.store.set_paused(id, false)?;
        Ok(())
    }

    /// The pause button of the header: all torrents (`paused`) or all back
    pub async fn pause_all(&self, paused: bool) -> anyhow::Result<()> {
        for item in self.store.in_downloads()? {
            let result = if paused { self.pause(item.id).await } else { self.resume(item.id).await };
            if let Err(e) = result {
                eprintln!("[torrents] {} {}: {e:#}", if paused { "pause" } else { "resume" }, item.name);
            }
        }
        Ok(())
    }

    async fn leave(&self, item: &Item, delete_files: bool) -> anyhow::Result<()> {
        let uploaded = self.uploaded_now(item);
        self.engine.remove(&item.info_hash, delete_files).await?;
        self.store.leave_downloads(item.id, delete_files, uploaded)?;
        lock(&self.files).remove(&item.id);
        Ok(())
    }

    /// «Убрать из загрузок» (files stay) and «Удалить с файлами»; the record stays in the archive
    pub async fn remove(&self, id: i64, delete_files: bool) -> anyhow::Result<()> {
        let item = self.item(id)?;
        if item.in_downloads {
            self.leave(&item, delete_files).await?;
        } else if delete_files {
            let content = item.content_path();
            if content.is_dir() {
                std::fs::remove_dir_all(&content)?;
            } else if content.exists() {
                std::fs::remove_file(&content)?;
            }
            self.store.leave_downloads(id, true, 0)?;
        }
        Ok(())
    }

    /// SPEC 4.3: when «Не раздавать после загрузки» is turned on, what already seeds goes too
    pub async fn archive_seeding(&self) -> anyhow::Result<usize> {
        let mut moved = 0;
        for item in self.store.in_downloads()? {
            if self.active_row(&item).state == TorrentState::Seeding {
                if item.completed_at.is_none() {
                    self.store.set_completed(item.id, now_ms())?;
                }
                self.leave(&item, false).await?;
                moved += 1;
            }
        }
        Ok(moved)
    }

    /// The «Файлы» tab: which files to download
    pub async fn set_files(&self, id: i64, only_files: Vec<usize>) -> anyhow::Result<()> {
        let item = self.item(id)?;
        anyhow::ensure!(!only_files.is_empty(), "choose at least one file");
        let all = self.files_of(id).len();
        if item.in_downloads {
            self.engine.set_only_files(&item.info_hash, &only_files).await?;
        }
        let stored = (only_files.len() < all).then_some(only_files);
        self.store.set_only_files(id, stored.as_deref())?;
        Ok(())
    }

    pub fn details(&self, id: i64) -> anyhow::Result<TorrentDetails> {
        let item = self.item(id)?;
        let bytes = self.stored_bytes(&item.info_hash)?;
        let torrent = librqbit::torrent_from_bytes(&bytes).context("broken .torrent in the archive")?;
        fn text<B: AsRef<[u8]>>(value: &Option<B>) -> Option<String> {
            value.as_ref().map(|v| String::from_utf8_lossy(v.as_ref()).into_owned())
        }
        let mut trackers: Vec<String> = Vec::new();
        for url in torrent.iter_announce().filter_map(|t| std::str::from_utf8(t.as_ref()).ok()) {
            if !trackers.iter().any(|known| known == url) {
                trackers.push(url.to_string());
            }
        }
        let (comment, created_by) = (text(&torrent.comment), text(&torrent.created_by));
        let created_at = torrent.creation_date.map(|secs| secs as i64 * 1000);
        let private = torrent.info.data.private;
        let info = torrent.info.data.validate().context("broken .torrent in the archive")?;
        let lengths = info.lengths();
        let handle = self.engine.torrent(&item.info_hash);
        // «Свои трекеры» the engine got on top of the torrent's own
        if let Some(torrent) = &handle {
            // The engine keeps them parsed: «http://T.example» comes back as «http://t.example/»
            let same = |a: &str, b: &str| a.trim_end_matches('/').eq_ignore_ascii_case(b.trim_end_matches('/'));
            let mut extra: Vec<String> = torrent
                .shared()
                .trackers
                .iter()
                .map(|url| url.to_string())
                .filter(|url| !trackers.iter().any(|own| same(own, url)))
                .collect();
            extra.sort();
            trackers.extend(extra);
        }
        let progress = handle.as_ref().map(|t| t.stats().file_progress).unwrap_or_default();
        let selected = |index: usize| item.only_files.as_ref().is_none_or(|only| only.contains(&index));
        let files = self
            .files_of(id)
            .into_iter()
            .map(|f| FileProgress { done: progress.get(f.index).copied().unwrap_or(0), selected: selected(f.index), index: f.index, path: f.path, size: f.size })
            .collect();
        let live_stats = handle.as_ref().and_then(|t| t.stats().live);
        let now = std::time::Instant::now();
        let peers = handle
            .and_then(|t| t.live())
            .map(|live| {
                let mut speeds = lock(&self.peer_speeds);
                let mut peers: Vec<PeerView> = live
                    .per_peer_stats_snapshot(Default::default())
                    .peers
                    .into_iter()
                    .map(|(address, stats)| {
                        let (downloaded, uploaded) = (stats.counters.fetched_bytes, stats.counters.uploaded_bytes);
                        let (download_speed, upload_speed) = speeds.update(id, &address, downloaded, uploaded, now);
                        PeerView {
                            connection: stats
                                .conn_kind
                                .and_then(|kind| serde_json::to_value(kind).ok())
                                .and_then(|v| v.as_str().map(str::to_uppercase))
                                .unwrap_or_default(),
                            client: stats.client_name,
                            address,
                            downloaded,
                            uploaded,
                            download_speed,
                            upload_speed,
                        }
                    })
                    .collect();
                speeds.keep_only(id, &peers.iter().map(|p| p.address.clone()).collect::<Vec<_>>());
                peers.sort_by(|a, b| b.downloaded.cmp(&a.downloaded).then(b.uploaded.cmp(&a.uploaded)));
                peers
            })
            .unwrap_or_default();
        let discovering = !private && !self.offline;
        Ok(TorrentDetails {
            files,
            peers,
            trackers,
            comment,
            created_by,
            created_at,
            private,
            piece_size: u64::from(lengths.default_piece_length()),
            pieces: u64::from(lengths.total_pieces()),
            magnet: engine::magnet_of(&bytes)?,
            piece_map: self.engine.piece_map(&item.info_hash, 300).unwrap_or_default(),
            peers_live: live_stats.as_ref().map_or(0, |s| s.snapshot.peer_stats.live),
            peers_seen: live_stats.as_ref().map_or(0, |s| s.snapshot.peer_stats.seen),
            lost: live_stats.as_ref().map_or(0, |s| s.snapshot.fetched_bytes.saturating_sub(s.snapshot.downloaded_and_checked_bytes)),
            // PeX has no switch in the engine: on whenever the torrent is not private
            discovery: Discovery { dht: discovering, pex: discovering, lsd: discovering },
            seeding: item.seeding,
        })
    }

    // ---------- the archive ----------

    pub fn archive(&self, query: &str) -> anyhow::Result<Vec<ArchiveEntry>> {
        Ok(self.store.archive(query)?.iter().map(ArchiveEntry::of).collect())
    }

    /// «Скачать снова»: the same record into the downloads, to its old folder or a new one
    pub async fn download_again(&self, id: i64, save_dir: Option<String>, start: bool) -> anyhow::Result<()> {
        let item = self.item(id)?;
        anyhow::ensure!(!item.in_downloads, "already in the downloads");
        let save_dir = save_dir.filter(|d| !d.trim().is_empty()).unwrap_or(item.save_dir.clone());
        self.store.return_to_downloads(id, &save_dir, item.only_files.as_deref(), !start, true)?;
        self.store.set_incomplete(id, self.incomplete_folder().as_deref())?;
        let item = self.item(id)?;
        if let Err(e) = self.start_item(&item).await {
            self.store.leave_downloads(id, item.files_deleted, 0)?;
            return Err(e);
        }
        Ok(())
    }

    /// «Снова раздавать»: the files on disk are checked, the torrent seeds again
    pub async fn seed_again(&self, id: i64) -> anyhow::Result<()> {
        let item = self.item(id)?;
        anyhow::ensure!(!item.in_downloads, "already in the downloads");
        anyhow::ensure!(item.content_path().exists(), "the files are not on disk");
        self.store.return_to_downloads(id, &item.save_dir, item.only_files.as_deref(), false, false)?;
        let item = self.item(id)?;
        if let Err(e) = self.start_item(&item).await {
            self.store.leave_downloads(id, false, 0)?;
            return Err(e);
        }
        Ok(())
    }

    /// «Удалить из архива»: the record and its .torrent; files on disk are not touched
    pub fn delete_record(&self, id: i64) -> anyhow::Result<()> {
        let item = self.item(id)?;
        self.store.delete(id)?;
        if let Err(e) = std::fs::remove_file(self.torrent_file(&item.info_hash)) {
            eprintln!("[torrents] remove .torrent: {e}");
        }
        Ok(())
    }

    pub fn magnet(&self, id: i64) -> anyhow::Result<String> {
        let item = self.item(id)?;
        engine::magnet_of(&self.stored_bytes(&item.info_hash)?)
    }


    /// The app is closing: this run's uploads into the ratio, the engine saves its state
    pub async fn shutdown(&self) {
        if let Ok(items) = self.store.in_downloads() {
            for item in items {
                if let Err(e) = self.store.add_uploaded(item.id, self.uploaded_now(&item)) {
                    eprintln!("[torrents] save ratio: {e}");
                }
            }
        }
        self.engine.stop().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_files_by_extension() {
        assert!(is_video(r"Season 1\Show.S01E01.MKV"));
        assert!(is_video("film.m2ts"));
        assert!(!is_video("subs.srt"));
        assert!(!is_video("setup.exe"));
    }

    #[test]
    fn a_multi_file_torrent_gets_its_own_folder() {
        assert_eq!(output_folder(r"D:\Сериалы", "Show.S01", 8), PathBuf::from(r"D:\Сериалы\Show.S01"));
        assert_eq!(output_folder(r"D:\Загрузки", "ubuntu.iso", 1), PathBuf::from(r"D:\Загрузки"));
    }
}
