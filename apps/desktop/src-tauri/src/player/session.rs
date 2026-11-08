//! The file being watched as the library sees it: saves the position and the viewing,
//! takes a frame for the home screen

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use libmpv2::Mpv;

use super::state::PlayerSnapshot;
use crate::library::{now_ms, Library};

/// While playing, the position is saved this often (and always on pause and at the end)
pub const SAVE_INTERVAL: Duration = Duration::from_secs(5);
/// First frame for the card: a bit into the file, past black intro frames
const FIRST_THUMB_AT: f64 = 15.0;
/// An opened and immediately replaced file is not a viewing: no history row before this
const MIN_VIEW_POSITION: f64 = 3.0;
/// The most one look at the position adds to the time played: the gap after a stall or a seek
/// is not watching
const MAX_STEP: Duration = Duration::from_secs(1);

/// The time a file really played, for «Статистика просмотра» (SPEC 3.2): the steps between
/// looks at the position while it plays. A pause stops the clock; the step after it starts it again
#[derive(Debug, Default)]
pub struct PlayClock {
    played: f64,
    last: Option<Instant>,
}

impl PlayClock {
    pub fn tick(&mut self, now: Instant, playing: bool) {
        if !playing {
            self.last = None;
            return;
        }
        if let Some(last) = self.last {
            self.played += now.duration_since(last).min(MAX_STEP).as_secs_f64();
        }
        self.last = Some(now);
    }

    pub fn stop(&mut self) {
        self.last = None;
    }

    pub fn seconds(&self) -> f64 {
        self.played
    }
}

pub struct Session {
    pub file_id: i64,
    pub series_key: Option<String>,
    pub clock: PlayClock,
    view_id: Option<i64>,
    started_at: i64,
    last_saved: Instant,
    has_thumb: bool,
}

impl Session {
    pub fn new(file_id: i64, series_key: Option<String>) -> Self {
        Self {
            file_id,
            series_key,
            clock: PlayClock::default(),
            view_id: None,
            started_at: now_ms(),
            last_saved: Instant::now(),
            has_thumb: false,
        }
    }

    pub fn save_due(&self) -> bool {
        self.last_saved.elapsed() >= SAVE_INTERVAL
    }

    pub fn wants_first_thumb(&self, position: f64) -> bool {
        !self.has_thumb && position >= FIRST_THUMB_AT
    }
}

pub fn lock(session: &Mutex<Option<Session>>) -> MutexGuard<'_, Option<Session>> {
    session.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Save the position of the current file; false if there is nothing to save (or the history is off)
pub fn save(library: &Library, session: &mut Session, state: &PlayerSnapshot) -> bool {
    if !library.keeps_history() || state.path.is_none() || state.idle || (session.view_id.is_none() && state.position < MIN_VIEW_POSITION) {
        return false;
    }
    session.last_saved = Instant::now();
    let played = session.clock.seconds();
    match library.save_progress(session.file_id, state.position, state.duration, &mut session.view_id, session.started_at, played) {
        Ok(()) => true,
        Err(e) => {
            eprintln!("[library] save progress: {e}");
            false
        }
    }
}

/// Current frame without subtitles → thumbs/<file id>.jpg
pub fn take_thumb(mpv: &Mpv, library: &Library, session: &mut Session) {
    if !library.keeps_history() {
        return;
    }
    let path = library.thumb_path(session.file_id);
    match mpv.command("screenshot-to-file", &[&path.to_string_lossy(), "video"]) {
        Ok(()) => {
            session.has_thumb = true;
            if let Err(e) = library.set_thumb(session.file_id) {
                eprintln!("[library] thumb: {e}");
            }
        }
        Err(e) => eprintln!("[player] screenshot: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_playing_counts_and_a_pause_is_not_watching() {
        let mut clock = PlayClock::default();
        let start = Instant::now();
        let at = |ms: u64| start + Duration::from_millis(ms);
        // 3 seconds of playing, a look every 100 ms
        for step in 0..=30 {
            clock.tick(at(step * 100), true);
        }
        assert!((clock.seconds() - 3.0).abs() < 1e-6, "{}", clock.seconds());
        // A pause of a minute: nothing comes, and the step after it starts the clock anew
        clock.stop();
        clock.tick(at(63_000), true);
        clock.tick(at(63_500), true);
        assert!((clock.seconds() - 3.5).abs() < 1e-6, "{}", clock.seconds());
        // A seek while paused is not watching either
        clock.tick(at(64_000), false);
        clock.tick(at(70_000), true);
        assert!((clock.seconds() - 3.5).abs() < 1e-6, "{}", clock.seconds());
        // A stall of 5 s while playing: one step adds at most a second
        clock.tick(at(75_000), true);
        assert!((clock.seconds() - 4.5).abs() < 1e-6, "{}", clock.seconds());
    }
}
