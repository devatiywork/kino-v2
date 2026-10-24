//! The settings' rules the engine has no notion of (SPEC 6 «Загрузки»), applied by the update
//! loop every second: the schedule of the alternative limits, the seeding limits by ratio and
//! time, the queue of downloads.

use windows::Win32::System::SystemInformation::GetLocalTime;

use super::store::{Item, Seeding};
use super::{lock, ActiveTorrent, TorrentState, Torrents};
use crate::db::now_ms;
use crate::settings::SeedLimitAction;

/// The local weekday (0 — Sunday) and minute of the day, as the schedule counts them
fn local_now() -> (u32, u32) {
    // SAFETY: GetLocalTime only fills the struct it returns
    let time = unsafe { GetLocalTime() };
    (u32::from(time.wDayOfWeek), u32::from(time.wHour) * 60 + u32::from(time.wMinute))
}

/// What the queue does with the downloads: (to start, to hold back)
pub fn queue_moves(waiting_order: &[i64], limit: usize, queued: &[i64]) -> (Vec<i64>, Vec<i64>) {
    let mut start = Vec::new();
    let mut hold = Vec::new();
    for (place, id) in waiting_order.iter().enumerate() {
        let allowed = limit == 0 || place < limit;
        let is_queued = queued.contains(id);
        if allowed && is_queued {
            start.push(*id);
        } else if !allowed && !is_queued {
            hold.push(*id);
        }
    }
    (start, hold)
}

impl Torrents {
    /// «Свои трекеры к новым загрузкам»
    pub(super) fn extra_trackers(&self) -> Vec<String> {
        self.settings.read(|s| s.extra_tracker_list())
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

    /// «Очередь»: at most this many download at once, by the order they were added; the others
    /// wait on pause. A torrent the user paused is not in the queue
    pub(super) async fn apply_queue(&self, items: &[Item]) -> anyhow::Result<()> {
        let limit = self.settings.read(|s| s.max_active_downloads) as usize;
        let mut waiting: Vec<&Item> = items.iter().filter(|i| !i.paused && i.completed_at.is_none()).collect();
        waiting.sort_by_key(|i| (i.added_at, i.id));
        let order: Vec<i64> = waiting.iter().map(|i| i.id).collect();
        let (start, hold) = {
            let mut queued = lock(&self.queued);
            queued.retain(|id| order.contains(id));
            queue_moves(&order, limit, &queued.iter().copied().collect::<Vec<_>>())
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

    #[test]
    fn the_queue_starts_the_first_ones_and_holds_the_rest() {
        assert_eq!(queue_moves(&[1, 2, 3], 2, &[]), (vec![], vec![3]));
        // The first one finished: the second and third move up, the third starts
        assert_eq!(queue_moves(&[2, 3], 2, &[3]), (vec![3], vec![]));
        assert_eq!(queue_moves(&[1, 2, 3], 0, &[2, 3]), (vec![2, 3], vec![]), "no limit — everyone runs");
        assert_eq!(queue_moves(&[], 1, &[]), (vec![], vec![]));
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
    fn the_local_time_is_a_weekday_and_a_minute() {
        let (weekday, minute) = local_now();
        assert!(weekday < 7 && minute < 24 * 60);
    }
}
