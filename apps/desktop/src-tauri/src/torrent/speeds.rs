//! Speeds the engine does not keep (SPEC 4.3): a torrent's speeds for the last 30 minutes (the
//! «Скорость» tab draws 1, 5 and 30 of them) and each peer's speed, from its counters a moment ago.

use std::collections::{HashMap, VecDeque};
use std::time::Instant;

/// One sample a second: 30 minutes
pub const HISTORY_LEN: usize = 30 * 60;

/// Download and upload, bytes per second, the oldest first
#[derive(Debug, Default)]
pub struct SpeedHistory {
    torrents: HashMap<i64, VecDeque<[u64; 2]>>,
}

impl SpeedHistory {
    /// This second's speeds of the torrents in the downloads; the others are forgotten
    pub fn record(&mut self, now: impl IntoIterator<Item = (i64, u64, u64)>) {
        let mut seen = Vec::new();
        for (id, down, up) in now {
            let samples = self.torrents.entry(id).or_default();
            samples.push_back([down, up]);
            while samples.len() > HISTORY_LEN {
                samples.pop_front();
            }
            seen.push(id);
        }
        self.torrents.retain(|id, _| seen.contains(id));
    }

    pub fn of(&self, id: i64) -> Vec<[u64; 2]> {
        self.torrents.get(&id).map(|s| s.iter().copied().collect()).unwrap_or_default()
    }
}

struct PeerSample {
    at: Instant,
    downloaded: u64,
    uploaded: u64,
    speeds: (u64, u64),
}

/// Each peer's counters at the last look: the next look turns the difference into speeds
#[derive(Default)]
pub struct PeerSpeeds {
    torrents: HashMap<i64, HashMap<String, PeerSample>>,
}

impl PeerSpeeds {
    /// (download, upload) bytes per second of a peer; looks closer than half a second apart
    /// keep the last speeds (the panel and a test may ask twice in a row)
    pub fn update(&mut self, torrent: i64, peer: &str, downloaded: u64, uploaded: u64, at: Instant) -> (u64, u64) {
        let peers = self.torrents.entry(torrent).or_default();
        let speeds = match peers.get(peer) {
            Some(last) if at.duration_since(last.at).as_secs_f64() < 0.5 => return last.speeds,
            Some(last) => {
                let seconds = at.duration_since(last.at).as_secs_f64();
                let rate = |now: u64, then: u64| (now.saturating_sub(then) as f64 / seconds) as u64;
                (rate(downloaded, last.downloaded), rate(uploaded, last.uploaded))
            }
            None => (0, 0),
        };
        peers.insert(peer.to_string(), PeerSample { at, downloaded, uploaded, speeds });
        speeds
    }

    /// Peers that left are forgotten
    pub fn keep_only(&mut self, torrent: i64, peers: &[String]) {
        if let Some(known) = self.torrents.get_mut(&torrent) {
            known.retain(|address, _| peers.contains(address));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn half_an_hour_of_samples_per_torrent() {
        let mut history = SpeedHistory::default();
        for second in 0..(HISTORY_LEN as u64 + 10) {
            history.record([(7, second, 1), (8, 0, 0)]);
        }
        let samples = history.of(7);
        assert_eq!(samples.len(), HISTORY_LEN);
        assert_eq!(samples[0], [10, 1], "the oldest went");
        history.record([(8, 5, 5)]);
        assert!(history.of(7).is_empty(), "left the downloads — forgotten");
    }

    #[test]
    fn a_peers_speed_from_its_counters() {
        let mut peers = PeerSpeeds::default();
        let start = Instant::now();
        assert_eq!(peers.update(1, "1.2.3.4:5", 1_000, 0, start), (0, 0), "nothing to compare with yet");
        assert_eq!(peers.update(1, "1.2.3.4:5", 3_000, 500, start + Duration::from_secs(2)), (1_000, 250));
        assert_eq!(peers.update(1, "1.2.3.4:5", 9_000, 500, start + Duration::from_millis(2_100)), (1_000, 250), "too soon — the last speeds");
        peers.keep_only(1, &[]);
        assert_eq!(peers.update(1, "1.2.3.4:5", 9_000, 500, start + Duration::from_secs(5)), (0, 0), "forgotten when gone");
    }
}
