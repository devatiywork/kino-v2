//! «Статистика просмотра» on the home screen (SPEC 3.2): how long the player really played and how
//! many episodes and films were watched through in the last 7, 30 and 365 days

use serde::Serialize;

use super::{is_sample, Library};

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

/// One period
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchStats {
    /// Seconds the player really played: a pause is not watching
    pub seconds: f64,
    /// Different episodes and films watched through; a release's sample is not a film
    pub episodes: u32,
    pub films: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct WatchStatsByPeriod {
    pub week: WatchStats,
    pub month: WatchStats,
    pub year: WatchStats,
}

impl Library {
    /// The last 7, 30 and 365 days up to `now`; a viewing belongs to the period it ended in
    pub fn watch_stats(&self, now: i64) -> rusqlite::Result<WatchStatsByPeriod> {
        Ok(WatchStatsByPeriod {
            week: self.stats_since(now - 7 * DAY_MS)?,
            month: self.stats_since(now - 30 * DAY_MS)?,
            year: self.stats_since(now - 365 * DAY_MS)?,
        })
    }

    fn stats_since(&self, since: i64) -> rusqlite::Result<WatchStats> {
        let conn = self.conn();
        let seconds: f64 = conn.query_row("SELECT COALESCE(SUM(played), 0) FROM player_views WHERE ended_at >= ?1", [since], |r| r.get(0))?;
        let mut stats = WatchStats { seconds, ..WatchStats::default() };
        let mut stmt = conn.prepare(
            "SELECT f.path, f.series_key IS NOT NULL FROM player_files f
             WHERE EXISTS (SELECT 1 FROM player_views v WHERE v.file_id = f.id AND v.finished = 1 AND v.ended_at >= ?1)",
        )?;
        for row in stmt.query_map([since], |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)))? {
            match row? {
                (_, true) => stats.episodes += 1,
                (path, false) if !is_sample(&path) => stats.films += 1,
                _ => {}
            }
        }
        Ok(stats)
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use rusqlite::params;

    use super::super::episode::describe;
    use super::*;
    use crate::library::now_ms;

    fn open(lib: &Library, path: &str, duration: f64) -> i64 {
        lib.register(path, &describe(Path::new(path)), Some(duration)).unwrap().id
    }

    /// A viewing that ended `days_ago`, as an older save left it
    fn viewed(lib: &Library, file: i64, days_ago: i64, played: f64, finished: bool) {
        let ended = now_ms() - days_ago * DAY_MS;
        lib.conn()
            .execute(
                "INSERT INTO player_views (file_id, started_at, ended_at, position, duration, played, finished) VALUES (?1, ?2, ?2, 0, 0, ?3, ?4)",
                params![file, ended, played, finished],
            )
            .unwrap();
    }

    #[test]
    fn time_played_and_what_was_watched_through_per_period() {
        let lib = Library::in_memory();
        let e1 = open(&lib, r"E:\S\The.Sopranos.S01E01.mkv", 1000.0);
        let e2 = open(&lib, r"E:\S\The.Sopranos.S01E02.mkv", 1000.0);
        let film = open(&lib, r"E:\F\Heat.1995.mkv", 6000.0);
        let old_film = open(&lib, r"E:\F\Alien.1979.mkv", 7000.0);
        let sample = open(&lib, r"E:\F\Heat.1995\sample.mkv", 60.0);

        // Today: E01 through, E02 half, the sample through
        lib.save_progress(e1, 950.0, Some(1000.0), &mut None, now_ms(), 900.0).unwrap();
        lib.save_progress(e2, 500.0, Some(1000.0), &mut None, now_ms(), 500.0).unwrap();
        lib.save_progress(sample, 59.0, Some(60.0), &mut None, now_ms(), 60.0).unwrap();
        // E01 again ten days ago, the film three weeks ago, another film half a year ago, a year and more ago
        viewed(&lib, e1, 10, 800.0, true);
        viewed(&lib, film, 20, 6000.0, true);
        viewed(&lib, old_film, 200, 7000.0, true);
        viewed(&lib, old_film, 400, 7000.0, true);

        let stats = lib.watch_stats(now_ms()).unwrap();
        assert_eq!(stats.week, WatchStats { seconds: 1460.0, episodes: 1, films: 0 }, "the sample's minute is time, not a film");
        assert_eq!(stats.month, WatchStats { seconds: 8260.0, episodes: 1, films: 1 }, "E01 twice is one episode");
        assert_eq!(stats.year, WatchStats { seconds: 15260.0, episodes: 1, films: 2 });
    }

    #[test]
    fn watched_through_stays_when_the_viewing_seeks_back() {
        let lib = Library::in_memory();
        let e1 = open(&lib, r"E:\S\The.Sopranos.S01E01.mkv", 1000.0);
        let mut view = None;
        lib.save_progress(e1, 950.0, Some(1000.0), &mut view, now_ms(), 950.0).unwrap();
        // back to a scene before closing
        lib.save_progress(e1, 400.0, Some(1000.0), &mut view, now_ms(), 980.0).unwrap();
        let stats = lib.watch_stats(now_ms()).unwrap();
        assert_eq!(stats.week, WatchStats { seconds: 980.0, episodes: 1, films: 0 });
    }
}
