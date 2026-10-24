//! The BitTorrent engine: librqbit inside the core. It keeps its own state next to the
//! database (fast resume: a restart does not re-check the files); the archive in SQLite says
//! which torrents it must have, `reconcile` brings the two together.

use std::collections::HashSet;
use std::num::NonZeroU32;
use std::str::FromStr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{anyhow, Context};
use librqbit::api::TorrentIdOrHash;
use bytes::Bytes;
use librqbit::dht::{DhtPersistenceConfig, Id20};
use librqbit::limits::LimitsConfig;
use librqbit::{
    AddTorrent, AddTorrentOptions, AddTorrentResponse, DhtSessionConfig, ListenerMode, ListenerOptions, ManagedTorrent,
    Session, SessionOptions, SessionPersistenceConfig, TorrentStats,
};

use super::store::FileEntry;
use crate::settings::{Encryption, Protocol};

/// SPEC 6 «Соединение» and the peer sources: read when the engine starts
#[derive(Debug, Clone, PartialEq)]
pub struct Network {
    /// 0 — a random port
    pub port: u16,
    pub upnp: bool,
    pub protocol: Protocol,
    /// MSE/PE (librqbit as Kino has it: crates/librqbit)
    pub encryption: Encryption,
    /// Connections per torrent; 0 — the engine's own
    pub peer_limit: u32,
    /// socks5://…; empty — none
    pub proxy: String,
    pub dht: bool,
    pub lsd: bool,
}

impl Default for Network {
    fn default() -> Self {
        Self {
            port: 0,
            upnp: true,
            protocol: Protocol::TcpAndUtp,
            encryption: Encryption::Prefer,
            peer_limit: 0,
            proxy: String::new(),
            dht: true,
            lsd: true,
        }
    }
}

pub struct EngineOptions {
    /// Where the engine keeps its state: the session, the DHT table
    pub state_dir: PathBuf,
    /// For torrents added without a folder (never by Kino itself)
    pub default_folder: PathBuf,
    /// Tests: no DHT, trackers, LSD or UPnP, listening on the loopback only
    pub offline: bool,
    pub download_kbps: u32,
    pub upload_kbps: u32,
    pub network: Network,
}

/// What the add dialog shows before anything starts
#[derive(Debug, Clone)]
pub struct Metainfo {
    pub info_hash: String,
    pub name: String,
    pub files: Vec<FileEntry>,
    /// The whole .torrent: stored in the archive (for a magnet — rebuilt from the peers' metadata)
    pub torrent_bytes: Bytes,
    /// The trackers it came with: the .torrent's, or a magnet link's `tr`
    pub trackers: Vec<String>,
}

/// The same tracker written two ways: the engine keeps them parsed, «http://T.example» comes
/// back as «http://t.example/»
pub fn same_tracker(a: &str, b: &str) -> bool {
    a.trim_end_matches('/').eq_ignore_ascii_case(b.trim_end_matches('/'))
}

/// The trackers of a .torrent, in its order, each once
pub fn trackers_of<B: AsRef<[u8]>>(torrent: &librqbit::TorrentMetaV1<B>) -> Vec<String> {
    let mut trackers: Vec<String> = Vec::new();
    for url in torrent.iter_announce().filter_map(|t| std::str::from_utf8(t.as_ref()).ok()) {
        if !trackers.iter().any(|known| same_tracker(known, url)) {
            trackers.push(url.to_string());
        }
    }
    trackers
}

/// A magnet link's trackers (`tr`)
pub fn magnet_trackers(uri: &str) -> Vec<String> {
    librqbit::Magnet::parse(uri).map(|magnet| magnet.trackers).unwrap_or_default()
}

/// KB/s → the engine's bytes per second; 0 — no limit
fn bps(kbps: u32) -> Option<NonZeroU32> {
    NonZeroU32::new(kbps.saturating_mul(1024))
}

/// Files of the torrent without BEP 47 padding: paths with `\`, indices as the engine counts them
fn files_of<B: AsRef<[u8]>>(info: &librqbit::ValidatedTorrentMetaV1Info<B>) -> Vec<FileEntry> {
    info.iter_file_details()
        .enumerate()
        .filter(|(_, file)| !file.attrs().padding)
        .map(|(index, file)| FileEntry { index, path: file.filename.to_vec().join("\\"), size: file.len })
        .collect()
}

/// `count` pieces (the bitfield may be longer) into at most `parts` parts, each 0…255
pub fn squeeze(haves: &[bool], count: usize, parts: usize) -> Vec<u8> {
    let parts = parts.min(count);
    (0..parts)
        .map(|part| {
            let (from, to) = (part * count / parts, ((part + 1) * count / parts).max(part * count / parts + 1));
            let have = haves.get(from..to.min(haves.len())).map_or(0, |pieces| pieces.iter().filter(|&&have| have).count());
            (have * 255 / (to - from)) as u8
        })
        .collect()
}

/// Reads a .torrent file: name, files, hash — without the engine
pub fn read_torrent(bytes: Bytes) -> anyhow::Result<Metainfo> {
    let torrent = librqbit::torrent_from_bytes(&bytes).context("not a .torrent file")?;
    let trackers = trackers_of(&torrent);
    let info = torrent.info.data.validate().context("broken .torrent file")?;
    let name = info.name().map(|n| n.into_owned()).unwrap_or_else(|| torrent.info_hash.as_string());
    let files = files_of(&info);
    Ok(Metainfo { info_hash: torrent.info_hash.as_string(), name, files, torrent_bytes: bytes, trackers })
}

/// The info hash of a magnet link, in lower-case hex
pub fn magnet_hash(uri: &str) -> anyhow::Result<String> {
    let magnet = librqbit::Magnet::parse(uri).context("not a magnet link")?;
    Ok(magnet.as_id20().context("the magnet link has no BitTorrent v1 hash")?.as_string())
}

/// A magnet link for the archive: hash, name and the torrent's trackers
pub fn magnet_of(torrent_bytes: &[u8]) -> anyhow::Result<String> {
    let torrent = librqbit::torrent_from_bytes(torrent_bytes).context("not a .torrent file")?;
    let trackers = torrent.iter_announce().filter_map(|t| std::str::from_utf8(t.as_ref()).ok().map(str::to_owned)).collect();
    let mut magnet = librqbit::Magnet::from_id20(torrent.info_hash, trackers, None);
    magnet.name = torrent.info.data.name.as_ref().map(|n| String::from_utf8_lossy(n.as_ref()).into_owned());
    Ok(magnet.to_string())
}

fn id_of(info_hash: &str) -> anyhow::Result<TorrentIdOrHash> {
    Ok(TorrentIdOrHash::Hash(Id20::from_str(info_hash).context("bad info hash")?))
}

pub struct Engine {
    session: Arc<Session>,
}

impl Engine {
    pub async fn start(options: EngineOptions) -> anyhow::Result<Self> {
        std::fs::create_dir_all(&options.state_dir)?;
        let net = &options.network;
        let host = if options.offline { "127.0.0.1" } else { "[::]" };
        let listen_addr = format!("{host}:{}", if options.offline { 0 } else { net.port });
        let session = Session::new_with_opts(
            options.default_folder,
            SessionOptions {
                fastresume: true,
                persistence: Some(SessionPersistenceConfig::Json { folder: Some(options.state_dir.join("session")) }),
                dht: (!options.offline && net.dht).then(|| DhtSessionConfig {
                    persistence: Some(DhtPersistenceConfig {
                        config_filename: Some(options.state_dir.join("dht.json")),
                        ..Default::default()
                    }),
                    ..Default::default()
                }),
                disable_trackers: options.offline,
                disable_local_service_discovery: options.offline || !net.lsd,
                listen: Some(ListenerOptions {
                    mode: match net.protocol {
                        Protocol::TcpAndUtp => ListenerMode::TcpAndUtp,
                        Protocol::Tcp => ListenerMode::TcpOnly,
                        Protocol::Utp => ListenerMode::UtpOnly,
                    },
                    listen_addr: listen_addr.parse()?,
                    enable_upnp_port_forwarding: !options.offline && net.upnp,
                    ..Default::default()
                }),
                connect: Some(librqbit::ConnectionOptions {
                    proxy_url: (!net.proxy.is_empty()).then(|| net.proxy.clone()),
                    peer_opts: Some(librqbit::PeerConnectionOptions {
                        encryption: match net.encryption {
                            Encryption::Prefer => librqbit::Encryption::Prefer,
                            Encryption::Require => librqbit::Encryption::Require,
                            Encryption::Off => librqbit::Encryption::Disable,
                        },
                        ..Default::default()
                    }),
                    ..Default::default()
                }),
                peer_limit: (net.peer_limit > 0).then_some(net.peer_limit as usize),
                ratelimits: LimitsConfig { download_bps: bps(options.download_kbps), upload_bps: bps(options.upload_kbps) },
                client_name_and_version: Some(format!("Kino {}", env!("CARGO_PKG_VERSION"))),
                ..Default::default()
            },
        )
        .await?;
        Ok(Self { session })
    }

    pub fn set_limits(&self, download_kbps: u32, upload_kbps: u32) {
        self.session.ratelimits.set_download_bps(bps(download_kbps));
        self.session.ratelimits.set_upload_bps(bps(upload_kbps));
    }

    /// Hashes of what the engine has now
    pub fn hashes(&self) -> Vec<String> {
        self.session.with_torrents(|torrents| torrents.map(|(_, t)| t.info_hash().as_string()).collect())
    }

    pub fn torrent(&self, info_hash: &str) -> Option<Arc<ManagedTorrent>> {
        self.session.get(id_of(info_hash).ok()?)
    }

    pub fn stats(&self, info_hash: &str) -> Option<TorrentStats> {
        self.torrent(info_hash).map(|t| t.stats())
    }

    /// The metadata of a magnet link from its peers: name and files before anything starts
    pub async fn resolve_magnet(&self, uri: &str) -> anyhow::Result<Metainfo> {
        let response = self
            .session
            .add_torrent(AddTorrent::from_url(uri), Some(AddTorrentOptions { list_only: true, ..Default::default() }))
            .await?;
        match response {
            AddTorrentResponse::ListOnly(list) => {
                let files = files_of(&list.info);
                let name = list.info.name().map(|n| n.into_owned()).unwrap_or_else(|| list.info_hash.as_string());
                Ok(Metainfo { info_hash: list.info_hash.as_string(), name, files, torrent_bytes: list.torrent_bytes, trackers: magnet_trackers(uri) })
            }
            AddTorrentResponse::AlreadyManaged(_, torrent) | AddTorrentResponse::Added(_, torrent) => torrent
                .with_metadata(|m| read_torrent(m.torrent_bytes.clone()))
                .map_err(|e| anyhow!("{e:#}"))?,
        }
    }

    /// Starts (or resumes) a torrent. `overwrite`: the files already on disk are checked and
    /// kept — this is what resumes a download and what seeds again
    /// `trackers` — «свои трекеры к новым загрузкам» on top of the torrent's own
    pub async fn add(&self, torrent_bytes: Bytes, output_folder: &Path, only_files: Option<Vec<usize>>, paused: bool, trackers: Vec<String>) -> anyhow::Result<()> {
        let options = AddTorrentOptions {
            paused,
            only_files,
            overwrite: true,
            output_folder: Some(output_folder.to_string_lossy().into_owned()),
            trackers: (!trackers.is_empty()).then_some(trackers),
            ..Default::default()
        };
        self.session.add_torrent(AddTorrent::from_bytes(torrent_bytes), Some(options)).await?;
        Ok(())
    }

    pub async fn pause(&self, info_hash: &str) -> anyhow::Result<()> {
        let torrent = self.torrent(info_hash).context("not in the engine")?;
        if !torrent.is_paused() {
            self.session.pause(&torrent).await?;
        }
        Ok(())
    }

    pub async fn resume(&self, info_hash: &str) -> anyhow::Result<()> {
        let torrent = self.torrent(info_hash).context("not in the engine")?;
        if torrent.is_paused() {
            self.session.unpause(&torrent).await?;
        }
        Ok(())
    }

    /// The pieces on disk squeezed into at most `parts` parts: 0…255 — how much of each part is
    /// there (SPEC 4.3 «Скачано»). None — the torrent is not in the engine or not checked yet
    pub fn piece_map(&self, info_hash: &str, parts: usize) -> Option<Vec<u8>> {
        let api = librqbit::api::Api::new(self.session.clone(), None);
        let (haves, count) = api.api_dump_haves(id_of(info_hash).ok()?).ok()?;
        Some(squeeze(&haves.iter().by_vals().collect::<Vec<bool>>(), count as usize, parts))
    }

    /// «Переобъявить»: a pause and a start again rebuild the requests to the trackers, DHT and LSD
    pub async fn reannounce(&self, info_hash: &str) -> anyhow::Result<()> {
        let torrent = self.torrent(info_hash).context("the torrent is not in the engine")?;
        if torrent.is_paused() {
            return Ok(());
        }
        self.session.pause(&torrent).await?;
        self.session.unpause(&torrent).await?;
        Ok(())
    }

    pub async fn set_only_files(&self, info_hash: &str, files: &[usize]) -> anyhow::Result<()> {
        let torrent = self.torrent(info_hash).context("not in the engine")?;
        self.session.update_only_files(&torrent, &files.iter().copied().collect::<HashSet<usize>>()).await?;
        Ok(())
    }

    /// Out of the engine; `delete_files` — the downloaded files too
    pub async fn remove(&self, info_hash: &str, delete_files: bool) -> anyhow::Result<()> {
        if self.torrent(info_hash).is_some() {
            self.session.delete(id_of(info_hash)?, delete_files).await?;
        }
        Ok(())
    }

    /// Saves the state (fast resume) and closes the connections
    pub async fn stop(&self) {
        self.session.stop().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A tiny torrent made from a real file, like `make-media.ps1` makes clips
    async fn torrent_of(dir: &Path, name: &str, size: usize) -> Bytes {
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, (0..size).map(|i| (i % 251) as u8).collect::<Vec<_>>()).unwrap();
        let spawner = librqbit::spawn_utils::BlockingSpawner::new(1);
        let created = librqbit::create_torrent(&path, librqbit::CreateTorrentOptions { piece_length: Some(16_384), ..Default::default() }, &spawner)
            .await
            .unwrap();
        created.as_bytes().unwrap()
    }

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("kino-engine-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    async fn offline_engine(dir: &Path) -> Engine {
        engine_with(dir, Encryption::Prefer).await
    }

    async fn engine_with(dir: &Path, encryption: Encryption) -> Engine {
        Engine::start(EngineOptions {
            state_dir: dir.join("state"),
            default_folder: dir.join("downloads"),
            offline: true,
            download_kbps: 0,
            upload_kbps: 0,
            network: Network { encryption, ..Network::default() },
        })
        .await
        .unwrap()
    }

    /// The seeder's encryption, the leecher's: whether the leecher gets the file within `within`
    async fn downloads(name: &str, seeds: Encryption, leeches: Encryption, within: std::time::Duration) -> bool {
        let dir = temp(name);
        let bytes = torrent_of(&dir.join("seed"), "clip.bin", 200_000).await;
        let hash = read_torrent(bytes.clone()).unwrap().info_hash;
        let seeder = engine_with(&dir.join("a"), seeds).await;
        seeder.add(bytes.clone(), &dir.join("seed"), None, false, Vec::new()).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(30), seeder.torrent(&hash).unwrap().wait_until_completed()).await.unwrap().unwrap();

        let leecher = engine_with(&dir.join("b"), leeches).await;
        let options = AddTorrentOptions {
            overwrite: true,
            output_folder: Some(dir.join("got").to_string_lossy().into_owned()),
            initial_peers: Some(vec![seeder.session.listen_addr().unwrap()]),
            ..Default::default()
        };
        let handle = leecher.session.add_torrent(AddTorrent::from_bytes(bytes), Some(options)).await.unwrap().into_handle().unwrap();
        let done = tokio::time::timeout(within, handle.wait_until_completed()).await.is_ok_and(|r| r.is_ok());
        if done {
            assert_eq!(std::fs::read(dir.join("got").join("clip.bin")).unwrap(), std::fs::read(dir.join("seed").join("clip.bin")).unwrap());
        }
        seeder.stop().await;
        leecher.stop().await;
        let _ = std::fs::remove_dir_all(&dir);
        done
    }

    #[test]
    fn the_piece_map_is_squeezed_into_parts() {
        let haves = [true, true, false, false, true, false];
        assert_eq!(squeeze(&haves, 6, 3), [255, 0, 127]);
        assert_eq!(squeeze(&haves, 6, 100), [255, 255, 0, 0, 255, 0], "never more parts than pieces");
        assert_eq!(squeeze(&[true; 8], 5, 5), [255; 5], "the bitfield is padded to bytes");
        assert!(squeeze(&[], 0, 10).is_empty());
    }

    #[test]
    fn a_torrent_file_is_read_without_the_engine() {
        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let dir = temp("read");
            let bytes = torrent_of(&dir.join("src"), "Film.2014.mkv", 100_000).await;
            let meta = read_torrent(bytes.clone()).unwrap();
            assert_eq!(meta.name, "Film.2014.mkv");
            assert_eq!(meta.files, vec![FileEntry { index: 0, path: "Film.2014.mkv".into(), size: 100_000 }]);
            assert_eq!(meta.info_hash.len(), 40);
            let magnet = magnet_of(&bytes).unwrap();
            assert!(magnet.starts_with(&format!("magnet:?xt=urn:btih:{}", meta.info_hash)), "{magnet}");
            assert_eq!(magnet_hash(&magnet).unwrap(), meta.info_hash);
            assert!(read_torrent(Bytes::from_static(b"not a torrent")).is_err());
            std::fs::remove_dir_all(&dir).unwrap();
        });
    }

    /// MSE/PE between two engines (crates/librqbit/src/mse.rs): a seeder that requires it is
    /// reached by one that prefers it, not by one that has it off; one that has it off is
    /// reached by one that prefers it — after the encrypted try, plain
    #[test]
    fn encryption_is_agreed_between_engines() {
        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let long = std::time::Duration::from_secs(60);
            assert!(downloads("enc-req-pref", Encryption::Require, Encryption::Prefer, long).await, "require ← prefer");
            assert!(downloads("enc-req-req", Encryption::Require, Encryption::Require, long).await, "require ← require");
            assert!(downloads("enc-off-pref", Encryption::Off, Encryption::Prefer, long).await, "off ← prefer: plain");
            assert!(!downloads("enc-req-off", Encryption::Require, Encryption::Off, std::time::Duration::from_secs(8)).await, "require ← off: refused");
        });
    }

    /// MSE/PE against libtorrent — what qBittorrent runs on — with its encryption forced, RC4 only:
    /// both ways, Kino downloads from it and it downloads from Kino. Needs Python with libtorrent:
    /// KINO_LIBTORRENT_PYTHON=<python.exe> cargo test encryption_interop -- --ignored
    /// (LT_TRANSPORT=tcp|utp for one transport only, LT_PEER_LOG=1 for libtorrent's own log)
    #[test]
    #[ignore]
    fn encryption_interop_with_libtorrent() {
        let python = std::env::var("KINO_LIBTORRENT_PYTHON").expect("KINO_LIBTORRENT_PYTHON: a python with libtorrent");
        let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts/libtorrent-peer.py");
        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let dir = temp("interop");
            let bytes = torrent_of(&dir.join("seed"), "clip.bin", 3_000_000).await;
            let torrent = dir.join("clip.torrent");
            std::fs::write(&torrent, &bytes).unwrap();
            let hash = read_torrent(bytes.clone()).unwrap().info_hash;
            let spawn = |args: Vec<String>| {
                std::process::Command::new(&python).arg("-I").arg(&script).args(args).stdout(std::process::Stdio::piped()).spawn().unwrap()
            };
            let path = |p: &Path| p.to_string_lossy().into_owned();

            // libtorrent seeds; Kino, preferring encryption, downloads
            let mut seeder = spawn(vec!["seed".into(), path(&torrent), path(&dir.join("seed")), "41651".into()]);
            let kino = engine_with(&dir.join("kino-leech"), Encryption::Prefer).await;
            let options = AddTorrentOptions {
                overwrite: true,
                output_folder: Some(path(&dir.join("kino-got"))),
                initial_peers: Some(vec!["127.0.0.1:41651".parse().unwrap()]),
                ..Default::default()
            };
            let handle = kino.session.add_torrent(AddTorrent::from_bytes(bytes.clone()), Some(options)).await.unwrap().into_handle().unwrap();
            let got = tokio::time::timeout(std::time::Duration::from_secs(60), handle.wait_until_completed()).await;
            seeder.kill().unwrap();
            seeder.wait().unwrap();
            assert!(got.is_ok_and(|r| r.is_ok()), "Kino downloads from libtorrent that forces RC4");
            assert_eq!(std::fs::read(dir.join("kino-got").join("clip.bin")).unwrap(), std::fs::read(dir.join("seed").join("clip.bin")).unwrap());
            kino.stop().await;

            // Kino seeds, requiring encryption; libtorrent downloads
            let kino = engine_with(&dir.join("kino-seed"), Encryption::Require).await;
            kino.add(bytes.clone(), &dir.join("seed"), None, false, Vec::new()).await.unwrap();
            tokio::time::timeout(std::time::Duration::from_secs(30), kino.torrent(&hash).unwrap().wait_until_completed()).await.unwrap().unwrap();
            let port = kino.session.listen_addr().unwrap().port().to_string();
            let leecher = spawn(vec!["leech".into(), path(&torrent), path(&dir.join("lt-got")), "41652".into(), port]);
            let out = tokio::task::spawn_blocking(move || leecher.wait_with_output().unwrap()).await.unwrap();
            let log = String::from_utf8_lossy(&out.stdout).into_owned();
            // Its policy is forced, RC4 only: had the stream been anything else, nothing would come
            assert!(out.status.success() && log.contains("DONE"), "libtorrent downloads from Kino:
{log}");
            kino.stop().await;
            let _ = std::fs::remove_dir_all(&dir);
        });
    }

    /// Two engines on the loopback: one seeds, the other downloads from it — no internet
    #[test]
    fn one_engine_downloads_from_another() {
        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let dir = temp("pair");
            let bytes = torrent_of(&dir.join("seed"), "clip.bin", 300_000).await;
            let hash = read_torrent(bytes.clone()).unwrap().info_hash;

            let seeder = offline_engine(&dir.join("a")).await;
            seeder.add(bytes.clone(), &dir.join("seed"), None, false, Vec::new()).await.unwrap();
            let seeding = seeder.torrent(&hash).unwrap();
            tokio::time::timeout(std::time::Duration::from_secs(30), seeding.wait_until_completed()).await.unwrap().unwrap();
            assert!(seeder.stats(&hash).unwrap().finished, "the files on disk are checked, not downloaded again");

            let leecher = offline_engine(&dir.join("b")).await;
            let out = dir.join("got");
            let options = AddTorrentOptions {
                overwrite: true,
                output_folder: Some(out.to_string_lossy().into_owned()),
                initial_peers: Some(vec![seeder.session.listen_addr().unwrap()]),
                ..Default::default()
            };
            let added = leecher.session.add_torrent(AddTorrent::from_bytes(bytes), Some(options)).await.unwrap();
            let handle = added.into_handle().unwrap();
            tokio::time::timeout(std::time::Duration::from_secs(60), handle.wait_until_completed()).await.unwrap().unwrap();
            assert_eq!(std::fs::read(out.join("clip.bin")).unwrap(), std::fs::read(dir.join("seed").join("clip.bin")).unwrap());

            leecher.pause(&hash).await.unwrap();
            assert!(leecher.torrent(&hash).unwrap().is_paused());
            leecher.remove(&hash, true).await.unwrap();
            assert!(leecher.hashes().is_empty());
            assert!(!out.join("clip.bin").exists(), "deleted with the files");
            seeder.stop().await;
            leecher.stop().await;
            let _ = std::fs::remove_dir_all(&dir);
        });
    }
}
