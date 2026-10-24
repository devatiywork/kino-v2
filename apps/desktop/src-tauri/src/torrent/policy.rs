//! The settings' rules the engine has no notion of (SPEC 6 «Загрузки»), applied by the update
//! loop every second: the schedule of the alternative limits, the seeding limits by ratio and
//! time, the queue; and the trackers the engine gets on top of a torrent's own.

use std::time::{Duration, Instant};

use anyhow::Context;
use windows::Win32::System::SystemInformation::GetLocalTime;

use super::engine::{same_tracker, trackers_of};
use super::store::{Item, Seeding};
use super::{lock, ActiveTorrent, TorrentState, Torrents};
use crate::db::now_ms;
use crate::settings::{is_tracker, SeedLimitAction};

/// «Медленные не считаются»: slower than this both ways (bytes per second)…
const SLOW_RATE: u64 = 2 * 1024;
/// …for this long, as qBittorrent counts
const SLOW_AFTER: Duration = Duration::from_secs(60);

/// The local weekday (0 — Sunday) and minute of the day, as the schedule counts them
fn local_now() -> (u32, u32) {
    // SAFETY: GetLocalTime only fills the struct it returns
    let time = unsafe { GetLocalTime() };
    (u32::from(time.wDayOfWeek), u32::from(time.wHour) * 60 + u32::from(time.wMinute))
}

/// A torrent the queue looks at
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Waiting {
    pub id: i64,
    pub seeding: bool,
    /// Running, but slow for a while: it runs on and takes no place («медленные не считаются»)
    pub slow: bool,
}

/// How many at once: downloading, seeding, all of them; 0 — no limit
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct QueueLimits {
    pub downloads: u32,
    pub seeds: u32,
    pub total: u32,
}

/// What the queue does with the torrents in the order they were added: (to start, to hold
/// back). Downloads take the places first, then the seeds, as in libtorrent
pub fn queue_moves(order: &[Waiting], limits: QueueLimits, queued: &[i64]) -> (Vec<i64>, Vec<i64>) {
    let fits = |count: u32, limit: u32| limit == 0 || count < limit;
    let (mut downloads, mut seeds, mut total) = (0, 0, 0);
    let (mut start, mut hold) = (Vec::new(), Vec::new());
    for torrent in order.iter().filter(|t| !t.seeding).chain(order.iter().filter(|t| t.seeding)) {
        let is_queued = queued.contains(&torrent.id);
        let free_ride = torrent.slow && !is_queued;
        let (own, own_limit) = if torrent.seeding { (seeds, limits.seeds) } else { (downloads, limits.downloads) };
        let allowed = free_ride || (fits(own, own_limit) && fits(total, limits.total));
        if allowed && !free_ride {
            if torrent.seeding {
                seeds += 1;
            } else {
                downloads += 1;
            }
            total += 1;
        }
        if allowed && is_queued {
            start.push(torrent.id);
        } else if !allowed && !is_queued {
            hold.push(torrent.id);
        }
    }
    (start, hold)
}

impl Torrents {
    /// What the engine gets on top of a torrent's own trackers: the ones merged into its record
    /// and «свои трекеры к новым загрузкам»
    pub(super) fn trackers_for(&self, item: Option<&Item>) -> Vec<String> {
        let mut all = item.map(|i| i.trackers.clone()).unwrap_or_default();
        for url in self.settings.read(|s| s.extra_tracker_list()) {
            if !all.iter().any(|known| same_tracker(known, &url)) {
                all.push(url);
            }
        }
        all
    }

    /// «Тот же торрент ещё раз — объединить трекеры» (SPEC 6): the trackers it came with this
    /// time join the archive's record; the engine gets them when it starts the torrent next.
    /// Returns how many are new
    pub(super) fn merge_trackers(&self, item: &Item, offered: &[String]) -> anyhow::Result<usize> {
        if !self.settings.read(|s| s.merge_trackers) {
            return Ok(0);
        }
        let bytes = self.stored_bytes(&item.info_hash)?;
        let own = trackers_of(&librqbit::torrent_from_bytes(&bytes).context("broken .torrent in the archive")?);
        let mut merged = item.trackers.clone();
        for url in offered.iter().filter(|url| is_tracker(url)) {
            if !own.iter().chain(&merged).any(|known| same_tracker(known, url)) {
                merged.push(url.clone());
            }
        }
        let added = merged.len() - item.trackers.len();
        if added > 0 {
            self.store.set_trackers(item.id, &merged)?;
        }
        Ok(added)
    }

    /// The settings now: the schedule may have changed them
    pub fn settings(&self) -> crate::settings::Settings {
        self.settings.get()
    }

    /// The engine gets the limits that hold now: the usual or the alternative ones
    pub fn refresh_limits(&self) {
        let limits = self.settings.read(|s| {
            if s.alt_limits_on { (s.alt_download_limit, s.alt_upload_limit) } else { (s.download_limit, s.upload_limit) }
        });
        let mut applied = lock(&self.applied_limits);
        if *applied != Some(limits) {
            self.engine.set_limits(limits.0, limits.1);
            *applied = Some(limits);
        }
    }

    /// The schedule turns the alternative limits on at «с» and off at «до» (and as it says when
    /// Kino starts or the schedule is changed); between its edges the user's own toggle holds, as
    /// in qBittorrent. Returns whether it changed the settings
    pub(super) fn follow_schedule(&self) -> anyhow::Result<bool> {
        let (weekday, minute) = local_now();
        let (scheduled, on) = self.settings.read(|s| (s.in_schedule(weekday, minute), s.alt_limits_on));
        let edge = std::mem::replace(&mut *lock(&self.schedule_was), scheduled) != scheduled;
        match scheduled {
            Some(now) if edge && now != on => {
                self.settings.update(serde_json::json!({ "altLimitsOn": now }).as_object().expect("an object"))?;
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    /// Seeding by the settings' rules (a torrent whose own seeding is «как в настройках»): at the
    /// ratio or after the time it pauses or goes to the archive. Returns the archived ones
    pub(super) async fn apply_seed_limits(&self, seeding: &[(Item, ActiveTorrent)]) -> anyhow::Result<Vec<(String, f64)>> {
        let (ratio_limit, minutes, action) = self.settings.read(|s| (s.seed_ratio_limit, s.seed_time_limit, s.seed_limit_action));
        let now = now_ms();
        let mut archived = Vec::new();
        for (item, row) in seeding {
            if item.seeding != Seeding::Default {
                continue;
            }
            let Some(since) = item.seeding_since else {
                self.store.set_seeding_since(item.id, Some(now))?;
                continue;
            };
            let by_ratio = ratio_limit > 0.0 && row.ratio >= ratio_limit;
            let by_time = minutes > 0 && now - since >= i64::from(minutes) * 60_000;
            if !(by_ratio || by_time) {
                continue;
            }
            match action {
                SeedLimitAction::Pause => self.pause(item.id).await?,
                SeedLimitAction::Archive => {
                    self.leave(item, false).await?;
                    archived.push((item.name.clone(), row.ratio));
                }
            }
        }
        Ok(archived)
    }

    /// «Очередь»: at most this many download, seed and run at all at once, by the order they
    /// were added; the others wait on pause. A torrent the user paused is not in the queue
    pub(super) async fn apply_queue(&self, items: &[Item]) -> anyhow::Result<()> {
        let (limits, skip_slow) = self.settings.read(|s| {
            (QueueLimits { downloads: s.max_active_downloads, seeds: s.max_active_seeds, total: s.max_active_total }, s.queue_skip_slow)
        });
        let mut waiting: Vec<&Item> = items.iter().filter(|i| !i.paused).collect();
        waiting.sort_by_key(|i| (i.added_at, i.id));
        let now = Instant::now();
        let (start, hold) = {
            let mut queued = lock(&self.queued);
            queued.retain(|id| waiting.iter().any(|i| i.id == *id));
            // Slow is counted only while it runs: the seconds it waited in the queue are not slow
            let mut running = lock(&self.running_since);
            running.retain(|id, _| waiting.iter().any(|i| i.id == *id) && !queued.contains(id));
            let speeds = lock(&self.speeds);
            let order: Vec<Waiting> = waiting
                .iter()
                .map(|item| {
                    let since = (!queued.contains(&item.id)).then(|| *running.entry(item.id).or_insert(now));
                    let slow = skip_slow
                        && since.is_some_and(|since| now.duration_since(since) >= SLOW_AFTER)
                        && speeds.quiet(item.id, SLOW_AFTER.as_secs() as usize, SLOW_RATE);
                    Waiting { id: item.id, seeding: item.completed_at.is_some(), slow }
                })
                .collect();
            queue_moves(&order, limits, &queued.iter().copied().collect::<Vec<_>>())
        };
        for id in start {
            if let Some(item) = waiting.iter().find(|i| i.id == id) {
                self.engine.resume(&item.info_hash).await?;
            }
            lock(&self.queued).remove(&id);
        }
        for id in hold {
            if let Some(item) = waiting.iter().find(|i| i.id == id) {
                self.engine.pause(&item.info_hash).await?;
            }
            lock(&self.queued).insert(id);
        }
        Ok(())
    }

    /// A queued torrent shows «В очереди», not «Пауза»
    pub(super) fn queued_state(&self, id: i64, state: TorrentState) -> TorrentState {
        if state == TorrentState::Paused && lock(&self.queued).contains(&id) {
            TorrentState::Queued
        } else {
            state
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn down(id: i64) -> Waiting {
        Waiting { id, seeding: false, slow: false }
    }

    fn seed(id: i64) -> Waiting {
        Waiting { id, seeding: true, slow: false }
    }

    #[test]
    fn the_queue_starts_the_first_ones_and_holds_the_rest() {
        let two = QueueLimits { downloads: 2, ..QueueLimits::default() };
        assert_eq!(queue_moves(&[down(1), down(2), down(3)], two, &[]), (vec![], vec![3]));
        // The first one finished: the second and third move up, the third starts
        assert_eq!(queue_moves(&[down(2), down(3)], two, &[3]), (vec![3], vec![]));
        assert_eq!(queue_moves(&[down(1), down(2), down(3)], QueueLimits::default(), &[2, 3]), (vec![2, 3], vec![]), "no limit — everyone runs");
        assert_eq!(queue_moves(&[], two, &[]), (vec![], vec![]));
    }

    #[test]
    fn seeds_and_the_total_have_their_own_limits_downloads_go_first() {
        let limits = QueueLimits { downloads: 0, seeds: 1, total: 2 };
        // Added in this order: a seed, two downloads, a seed. The downloads take the two places
        let order = [seed(1), down(2), down(3), seed(4)];
        assert_eq!(queue_moves(&order, limits, &[]), (vec![], vec![1, 4]));
        // One download finished and left: the first seed comes back, the second waits
        assert_eq!(queue_moves(&[seed(1), down(2), seed(4)], limits, &[1, 4]), (vec![1], vec![]));
    }

    #[test]
    fn a_slow_running_torrent_takes_no_place() {
        let one = QueueLimits { downloads: 1, ..QueueLimits::default() };
        let slow = Waiting { id: 1, seeding: false, slow: true };
        assert_eq!(queue_moves(&[slow, down(2)], one, &[2]), (vec![2], vec![]), "the second starts beside the slow one");
        assert_eq!(queue_moves(&[down(1), down(2)], one, &[2]), (vec![], vec![]), "not slow — the second waits");
    }

    #[test]
    fn the_second_download_waits_in_the_queue_until_the_first_is_gone_and_gets_my_trackers() {
        use std::sync::Arc;

        use crate::library::Library;
        use crate::settings::SettingsStore;
        use crate::torrent::{AddRequest, PreviewSource, TorrentsOptions};

        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let root = std::env::temp_dir().join(format!("kino-queue-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(root.join("src")).unwrap();
            let settings = Arc::new(SettingsStore::load(Arc::new(Library::in_memory())));
            let extra = "udp://tracker.example:6969/announce";
            settings.update(serde_json::json!({ "maxActiveDownloads": 1, "extraTrackers": extra }).as_object().unwrap()).unwrap();
            let torrents = Torrents::start(TorrentsOptions {
                db_path: root.join("kino.db"),
                dir: root.join("torrents"),
                system_downloads: root.join("downloads"),
                settings,
                offline: true,
            })
            .await
            .unwrap();
            // Two torrents whose files are nowhere: offline they download forever
            let mut ids = Vec::new();
            for (n, name) in ["One.mkv", "Two.mkv"].into_iter().enumerate() {
                let file = root.join("src").join(name);
                std::fs::write(&file, vec![n as u8 + 1; 40_000]).unwrap();
                let spawner = librqbit::spawn_utils::BlockingSpawner::new(1);
                let made = librqbit::create_torrent(&file, librqbit::CreateTorrentOptions { piece_length: Some(16_384), ..Default::default() }, &spawner)
                    .await
                    .unwrap();
                let torrent = root.join(format!("{name}.torrent"));
                std::fs::write(&torrent, made.as_bytes().unwrap()).unwrap();
                let preview = torrents.preview(PreviewSource::File { path: torrent.to_string_lossy().into_owned() }).await.unwrap();
                let request = AddRequest {
                    info_hash: preview.info_hash,
                    category_id: None,
                    save_dir: root.join("out").to_string_lossy().into_owned(),
                    only_files: None,
                    source_url: None,
                    start: true,
                };
                ids.push(torrents.add(request).await.unwrap());
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            let state = |torrents: &Torrents, id: i64| torrents.snapshot().unwrap().torrents.into_iter().find(|t| t.id == id).map(|t| t.state);
            torrents.tick().await.unwrap();
            assert_eq!(state(&torrents, ids[1]), Some(TorrentState::Queued), "the second waits");
            assert_ne!(state(&torrents, ids[0]), Some(TorrentState::Queued));
            assert!(torrents.details(ids[1]).unwrap().trackers.iter().any(|t| t == extra), "«свои трекеры» are added");

            torrents.remove(ids[0], false).await.unwrap();
            torrents.tick().await.unwrap();
            assert_ne!(state(&torrents, ids[1]), Some(TorrentState::Queued), "its turn");
            assert!(!torrents.engine.torrent(&torrents.item(ids[1]).unwrap().info_hash).unwrap().is_paused());
            torrents.shutdown().await;
            let _ = std::fs::remove_dir_all(&root);
        });
    }

    #[test]
    fn the_schedule_switches_the_alternative_limits_at_its_edges_only() {
        use std::sync::Arc;

        use crate::library::Library;
        use crate::settings::SettingsStore;
        use crate::torrent::TorrentsOptions;

        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let root = std::env::temp_dir().join(format!("kino-schedule-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            let settings = Arc::new(SettingsStore::load(Arc::new(Library::in_memory())));
            let torrents = Torrents::start(TorrentsOptions {
                db_path: root.join("kino.db"),
                dir: root.join("torrents"),
                system_downloads: root.join("downloads"),
                settings: settings.clone(),
                offline: true,
            })
            .await
            .unwrap();
            let set = |patch: serde_json::Value| settings.update(patch.as_object().unwrap()).unwrap();
            assert!(!torrents.follow_schedule().unwrap(), "no schedule — nothing to do");

            // A schedule of this very minute: now is inside it, the limits go on
            let (_, minute) = local_now();
            let (from, to) = (format!("{:02}:{:02}", minute / 60, minute % 60), format!("{:02}:{:02}", (minute + 1) % 1440 / 60, (minute + 1) % 60));
            set(serde_json::json!({ "scheduleEnabled": true, "scheduleFrom": from, "scheduleTo": to, "scheduleDays": "everyday" }));
            if local_now().1 != minute {
                // The minute turned while the test ran: the window is gone, try again another time
                return;
            }
            assert!(torrents.follow_schedule().unwrap());
            assert!(settings.read(|s| s.alt_limits_on));

            // Off by hand inside the window: the schedule does not turn them back on
            set(serde_json::json!({ "altLimitsOn": false }));
            assert!(!torrents.follow_schedule().unwrap());
            assert!(!settings.read(|s| s.alt_limits_on));
            torrents.shutdown().await;
            let _ = std::fs::remove_dir_all(&root);
        });
    }

    #[test]
    fn the_same_torrent_again_brings_its_new_trackers_into_the_record() {
        use std::sync::Arc;

        use crate::library::Library;
        use crate::settings::SettingsStore;
        use crate::torrent::{AddRequest, PreviewSource, TorrentsOptions};

        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let root = std::env::temp_dir().join(format!("kino-merge-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(&root).unwrap();
            let film = root.join("Film.mkv");
            std::fs::write(&film, vec![7u8; 40_000]).unwrap();
            // One file, two .torrent files: the same info hash, other trackers
            let spawner = librqbit::spawn_utils::BlockingSpawner::new(1);
            let mut files = Vec::new();
            for (name, trackers) in [("first", vec!["udp://a.example:80/announce"]), ("second", vec!["udp://a.example:80/announce", "http://B.example/announce"])] {
                let options = librqbit::CreateTorrentOptions {
                    piece_length: Some(16_384),
                    trackers: trackers.into_iter().map(str::to_string).collect(),
                    ..Default::default()
                };
                let made = librqbit::create_torrent(&film, options, &spawner).await.unwrap();
                let file = root.join(format!("{name}.torrent"));
                std::fs::write(&file, made.as_bytes().unwrap()).unwrap();
                files.push(file.to_string_lossy().into_owned());
            }
            let settings = Arc::new(SettingsStore::load(Arc::new(Library::in_memory())));
            let torrents = Torrents::start(TorrentsOptions {
                db_path: root.join("kino.db"),
                dir: root.join("torrents"),
                system_downloads: root.join("downloads"),
                settings: settings.clone(),
                offline: true,
            })
            .await
            .unwrap();
            let preview = |path: &str| torrents.preview(PreviewSource::File { path: path.to_string() });
            let first = preview(&files[0]).await.unwrap();
            let request = AddRequest { info_hash: first.info_hash, category_id: None, save_dir: root.to_string_lossy().into_owned(), only_files: None, source_url: None, start: true };
            let id = torrents.add(request).await.unwrap();

            let again = preview(&files[1]).await.unwrap();
            assert_eq!((again.duplicate.map(|d| d.id), again.merged_trackers), (Some(id), 1));
            assert_eq!(torrents.item(id).unwrap().trackers, ["http://B.example/announce"]);
            let listed = torrents.details(id).unwrap().trackers;
            assert_eq!(listed[..2], ["udp://a.example:80/announce", "http://B.example/announce"]);
            assert_eq!(listed.len(), 2, "the engine's «http://b.example/announce» is the same tracker");
            assert_eq!(preview(&files[1]).await.unwrap().merged_trackers, 0, "already merged");

            settings.update(serde_json::json!({ "mergeTrackers": false }).as_object().unwrap()).unwrap();
            torrents.store.set_trackers(id, &[]).unwrap();
            assert_eq!(preview(&files[1]).await.unwrap().merged_trackers, 0, "the setting is off");
            torrents.shutdown().await;
            let _ = std::fs::remove_dir_all(&root);
        });
    }

    #[test]
    fn the_local_time_is_a_weekday_and_a_minute() {
        let (weekday, minute) = local_now();
        assert!(weekday < 7 && minute < 24 * 60);
    }
}
