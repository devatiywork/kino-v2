//! A download that stands still with peers connected: its peers are reconnected.
//!
//! librqbit keeps a connection to a peer that chokes it for as long as the peer likes and does
//! not look for others meanwhile; libtorrent (qBittorrent) drops such peers and tries again. The
//! owner saw it: peers there, nothing coming, and a restart of Kino starting the download at once.
//! A fresh connection is a fresh chance at the peer's optimistic unchoke — this is a restart of
//! one torrent's peers, by pause and resume, never more often than `KICK_EVERY`

use std::collections::HashMap;
use std::time::{Duration, Instant};

/// Peers connected and not a byte coming for this long
pub const STALL_AFTER: Duration = Duration::from_secs(90);
/// The least time between two reconnections of one torrent
pub const KICK_EVERY: Duration = Duration::from_secs(300);

/// One torrent at one tick of the update loop
#[derive(Debug, Clone, Copy)]
pub struct Look {
    pub id: i64,
    /// Downloading (not paused, queued, checking or done)
    pub downloading: bool,
    pub peers: usize,
    pub download_speed: u64,
}

#[derive(Debug, Default)]
pub struct Stalls {
    /// Since when a torrent has had peers and no download
    since: HashMap<i64, Instant>,
    kicked: HashMap<i64, Instant>,
    count: HashMap<i64, u32>,
}

impl Stalls {
    /// A tick's look at the downloads: the torrents to reconnect now
    pub fn observe(&mut self, now: Instant, looks: &[Look]) -> Vec<i64> {
        self.since.retain(|id, _| looks.iter().any(|l| l.id == *id));
        let mut kick = Vec::new();
        for look in looks {
            if !(look.downloading && look.peers > 0 && look.download_speed == 0) {
                self.since.remove(&look.id);
                continue;
            }
            let since = *self.since.entry(look.id).or_insert(now);
            let rested = self.kicked.get(&look.id).is_none_or(|at| now.duration_since(*at) >= KICK_EVERY);
            if now.duration_since(since) >= STALL_AFTER && rested {
                self.kicked.insert(look.id, now);
                self.since.remove(&look.id);
                *self.count.entry(look.id).or_default() += 1;
                kick.push(look.id);
            }
        }
        kick
    }

    /// How many times a torrent's peers were reconnected in this run of Kino
    pub fn reconnects(&self, id: i64) -> u32 {
        self.count.get(&id).copied().unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn look(id: i64, peers: usize, speed: u64) -> Look {
        Look { id, downloading: true, peers, download_speed: speed }
    }

    #[test]
    fn peers_and_nothing_coming_for_long_enough_reconnects_once_then_rests() {
        let mut stalls = Stalls::default();
        let start = Instant::now();
        let at = |secs: u64| start + Duration::from_secs(secs);
        assert!(stalls.observe(at(0), &[look(1, 5, 0)]).is_empty());
        assert!(stalls.observe(at(89), &[look(1, 5, 0)]).is_empty());
        assert_eq!(stalls.observe(at(90), &[look(1, 5, 0)]), vec![1]);
        assert_eq!(stalls.reconnects(1), 1);
        // Still nothing: the next try only after the rest
        assert!(stalls.observe(at(200), &[look(1, 5, 0)]).is_empty());
        assert!(stalls.observe(at(389), &[look(1, 5, 0)]).is_empty());
        assert_eq!(stalls.observe(at(390), &[look(1, 5, 0)]), vec![1]);
        assert_eq!(stalls.reconnects(1), 2);
    }

    #[test]
    fn a_byte_coming_no_peers_or_not_downloading_is_not_a_stall() {
        let mut stalls = Stalls::default();
        let start = Instant::now();
        let at = |secs: u64| start + Duration::from_secs(secs);
        stalls.observe(at(0), &[look(1, 5, 0), look(2, 0, 0), Look { id: 3, downloading: false, peers: 5, download_speed: 0 }]);
        // Torrent 1 got going for a moment: its count starts over
        stalls.observe(at(60), &[look(1, 5, 4096), look(2, 0, 0), Look { id: 3, downloading: false, peers: 5, download_speed: 0 }]);
        let kicked = stalls.observe(at(120), &[look(1, 5, 0), look(2, 0, 0), Look { id: 3, downloading: false, peers: 5, download_speed: 0 }]);
        assert!(kicked.is_empty(), "1 stands again since 120 only, 2 has no peers to drop, 3 is not downloading");
        assert!(stalls.observe(at(180), &[look(1, 5, 0)]).is_empty());
        assert_eq!(stalls.observe(at(210), &[look(1, 5, 0)]), vec![1]);
        assert_eq!(stalls.reconnects(2), 0);
    }
}
