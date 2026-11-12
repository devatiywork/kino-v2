//! When to pause and when to go on, from a look a second at the camera and at the player (pure)

use std::time::{Duration, Instant};

/// The pause goes back to a bit before the moment the face was seen last: nothing is missed
const REWIND: f64 = 2.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Act {
    None,
    /// Pause, and go back to where the viewer still watched
    Pause { back_to: f64 },
    Resume,
}

/// One look
#[derive(Debug, Clone, Copy)]
pub struct Look {
    pub now: Instant,
    /// Someone is in front of the camera
    pub face: bool,
    /// The video plays (not paused, not at its end)
    pub playing: bool,
    pub position: f64,
}

#[derive(Debug, Default)]
pub struct Watch {
    /// When a face was seen last, and the position then
    seen: Option<(Instant, f64)>,
    /// The pause is ours: a face back may resume it
    paused_by_us: bool,
}

impl Watch {
    /// The camera is needed while the video plays, or while our pause waits for the viewer
    pub fn wants_camera(&self, playing: bool, resume: bool) -> bool {
        playing || (self.paused_by_us && resume)
    }

    /// Off, nothing open, or the user paused: the next playing starts its own wait
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn observe(&mut self, look: Look, away_after: Duration, resume: bool) -> Act {
        if self.paused_by_us && look.playing {
            // Played by hand: the pause is not ours any more
            self.paused_by_us = false;
            self.seen = Some((look.now, look.position));
        }
        if look.face {
            if self.paused_by_us {
                self.paused_by_us = false;
                self.seen = Some((look.now, look.position));
                return if resume { Act::Resume } else { Act::None };
            }
            if look.playing {
                self.seen = Some((look.now, look.position));
            }
            return Act::None;
        }
        if !look.playing {
            return Act::None;
        }
        // No face yet since it started playing: the wait starts now
        let (since, position) = *self.seen.get_or_insert((look.now, look.position));
        if look.now.duration_since(since) < away_after {
            return Act::None;
        }
        self.paused_by_us = true;
        Act::Pause { back_to: (position - REWIND).clamp(0.0, look.position) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AWAY: Duration = Duration::from_secs(20);

    /// Looks a second apart from `start`: (second, face, playing, position)
    fn run(watch: &mut Watch, resume: bool, looks: &[(u64, bool, bool, f64)]) -> Vec<(u64, Act)> {
        let start = Instant::now();
        looks
            .iter()
            .filter_map(|&(second, face, playing, position)| {
                let look = Look { now: start + Duration::from_secs(second), face, playing, position };
                match watch.observe(look, AWAY, resume) {
                    Act::None => None,
                    act => Some((second, act)),
                }
            })
            .collect()
    }

    #[test]
    fn away_for_the_whole_wait_pauses_back_where_the_face_was_last() {
        let mut watch = Watch::default();
        let acts = run(&mut watch, true, &[(0, true, true, 100.0), (5, true, true, 105.0), (6, false, true, 106.0), (24, false, true, 124.0), (25, false, true, 125.0)]);
        assert_eq!(acts, [(25, Act::Pause { back_to: 103.0 })], "20 s after the last face, back to 2 s before it");
        assert!(watch.wants_camera(false, true), "our pause waits for the viewer");
        // Back: the video goes on by itself
        let acts = run(&mut watch, true, &[(90, true, false, 103.0)]);
        assert_eq!(acts, [(90, Act::Resume)]);
    }

    #[test]
    fn a_face_now_and_then_keeps_it_playing() {
        let mut watch = Watch::default();
        // Looking at the phone for 15 s, twice
        let acts = run(&mut watch, true, &[(0, true, true, 0.0), (15, false, true, 15.0), (16, true, true, 16.0), (31, false, true, 31.0), (32, true, true, 32.0)]);
        assert!(acts.is_empty());
    }

    #[test]
    fn a_video_started_with_nobody_in_front_waits_the_whole_time_first() {
        let mut watch = Watch::default();
        let acts = run(&mut watch, true, &[(0, false, true, 0.0), (19, false, true, 19.0), (20, false, true, 20.0)]);
        assert_eq!(acts, [(20, Act::Pause { back_to: 0.0 })]);
    }

    #[test]
    fn without_resume_the_face_back_changes_nothing_and_the_camera_goes_off() {
        let mut watch = Watch::default();
        run(&mut watch, false, &[(0, true, true, 50.0), (20, false, true, 70.0)]);
        assert!(!watch.wants_camera(false, false));
        assert!(run(&mut watch, false, &[(40, true, false, 48.0)]).is_empty());
    }

    #[test]
    fn played_by_hand_after_our_pause_is_the_users_again() {
        let mut watch = Watch::default();
        run(&mut watch, true, &[(0, true, true, 0.0), (20, false, true, 20.0)]);
        // The user pressed play while still out of the camera's sight: a new wait, no resume later
        assert!(run(&mut watch, true, &[(30, false, true, 0.5)]).is_empty());
        assert!(!watch.wants_camera(false, true));
        let acts = run(&mut watch, true, &[(49, false, true, 19.5), (50, false, true, 20.5)]);
        assert_eq!(acts, [(50, Act::Pause { back_to: 0.0 })]);
    }

    #[test]
    fn a_users_own_pause_is_never_resumed() {
        let mut watch = Watch::default();
        run(&mut watch, true, &[(0, true, true, 10.0)]);
        assert!(!watch.wants_camera(false, true), "paused by hand: the camera goes off");
        assert!(run(&mut watch, true, &[(5, true, false, 10.0)]).is_empty());
    }
}
