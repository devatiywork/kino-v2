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

pub struct Session {
    pub file_id: i64,
    pub series_key: Option<String>,
    view_id: Option<i64>,
    started_at: i64,
    last_saved: Instant,
    has_thumb: bool,
}

impl Session {
    pub fn new(file_id: i64, series_key: Option<String>) -> Self {
        Self { file_id, series_key, view_id: None, started_at: now_ms(), last_saved: Instant::now(), has_thumb: false }
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
    match library.save_progress(session.file_id, state.position, state.duration, &mut session.view_id, session.started_at) {
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
