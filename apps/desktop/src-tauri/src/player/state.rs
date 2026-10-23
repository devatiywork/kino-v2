//! Player state as the renderer sees it, built from mpv property changes

use serde::Serialize;

use super::tracks::{parse_track_list, Track};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSnapshot {
    pub path: Option<String>,
    pub title: Option<String>,
    /// From the file name (library/episode.rs): «The Sopranos», season 1, episode 5
    pub series_key: Option<String>,
    pub series_title: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    /// Neighbouring episodes on disk (N / P, the buttons)
    pub has_prev: bool,
    pub has_next: bool,
    pub duration: Option<f64>,
    pub position: f64,
    pub paused: bool,
    /// Nothing loaded
    pub idle: bool,
    pub buffering: bool,
    pub eof: bool,
    pub volume: f64,
    pub muted: bool,
    pub speed: f64,
    pub audio_id: Option<i64>,
    pub subtitle_id: Option<i64>,
    pub subtitles_visible: bool,
    pub tracks: Vec<Track>,
    pub hwdec: Option<String>,
}

impl Default for PlayerSnapshot {
    fn default() -> Self {
        Self {
            path: None,
            title: None,
            series_key: None,
            series_title: None,
            season: None,
            episode: None,
            has_prev: false,
            has_next: false,
            duration: None,
            position: 0.0,
            paused: false,
            idle: true,
            buffering: false,
            eof: false,
            volume: 100.0,
            muted: false,
            speed: 1.0,
            audio_id: None,
            subtitle_id: None,
            subtitles_visible: true,
            tracks: Vec::new(),
            hwdec: None,
        }
    }
}

/// Property value without libmpv types — keeps the state logic testable
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Prop<'a> {
    Str(&'a str),
    Flag(bool),
    Int(i64),
    Double(f64),
}

/// What a property change touched: position goes out throttled, the rest at once
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Ignored,
    Position,
    State,
}

/// Observed properties and the format they are read in
pub const OBSERVED: &[(&str, ObservedFormat)] = &[
    ("path", ObservedFormat::Str),
    ("duration", ObservedFormat::Double),
    ("time-pos", ObservedFormat::Double),
    ("pause", ObservedFormat::Flag),
    ("idle-active", ObservedFormat::Flag),
    ("paused-for-cache", ObservedFormat::Flag),
    ("eof-reached", ObservedFormat::Flag),
    ("volume", ObservedFormat::Double),
    ("mute", ObservedFormat::Flag),
    ("speed", ObservedFormat::Double),
    ("aid", ObservedFormat::Str),
    ("sid", ObservedFormat::Str),
    ("sub-visibility", ObservedFormat::Flag),
    ("track-list", ObservedFormat::Str),
    ("hwdec-current", ObservedFormat::Str),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ObservedFormat {
    Str,
    Flag,
    Double,
}

/// `aid` / `sid` as strings: "no" and "auto" mean no explicit track
pub fn parse_track_id(value: &str) -> Option<i64> {
    value.parse().ok()
}

impl PlayerSnapshot {
    /// A file is open and the picture moves
    pub fn is_playing(&self) -> bool {
        self.path.is_some() && !self.idle && !self.paused && !self.eof
    }

    pub fn apply(&mut self, name: &str, value: Prop) -> Change {
        use Prop::*;
        match (name, value) {
            ("time-pos", Double(v)) => {
                self.position = v.max(0.0);
                return Change::Position;
            }
            ("path", Str(v)) => self.path = Some(v.to_owned()),
            ("duration", Double(v)) => self.duration = Some(v),
            ("pause", Flag(v)) => self.paused = v,
            ("idle-active", Flag(v)) => {
                self.idle = v;
                if v {
                    self.clear_file();
                }
            }
            ("paused-for-cache", Flag(v)) => self.buffering = v,
            ("eof-reached", Flag(v)) => self.eof = v,
            ("volume", Double(v)) => self.volume = v,
            ("volume", Int(v)) => self.volume = v as f64,
            ("mute", Flag(v)) => self.muted = v,
            ("speed", Double(v)) => self.speed = v,
            ("aid", Str(v)) => self.audio_id = parse_track_id(v),
            ("sid", Str(v)) => self.subtitle_id = parse_track_id(v),
            ("sub-visibility", Flag(v)) => self.subtitles_visible = v,
            ("track-list", Str(v)) => match parse_track_list(v) {
                Ok(tracks) => self.tracks = tracks,
                Err(e) => {
                    eprintln!("[player] track-list: {e}");
                    return Change::Ignored;
                }
            },
            ("hwdec-current", Str(v)) => self.hwdec = Some(v.to_owned()).filter(|s| s != "no"),
            _ => return Change::Ignored,
        }
        Change::State
    }

    /// File-specific fields. libmpv2 does not report "unavailable", so they are reset when
    /// the player goes idle; on FileLoaded events.rs overwrites them with fresh values
    pub fn clear_file(&mut self) {
        self.path = None;
        self.title = None;
        self.series_key = None;
        self.series_title = None;
        self.season = None;
        self.episode = None;
        self.has_prev = false;
        self.has_next = false;
        self.duration = None;
        self.position = 0.0;
        self.eof = false;
        self.buffering = false;
        self.audio_id = None;
        self.subtitle_id = None;
        self.tracks.clear();
        self.hwdec = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn position_is_reported_separately() {
        let mut s = PlayerSnapshot::default();
        assert_eq!(s.apply("time-pos", Prop::Double(12.5)), Change::Position);
        assert_eq!(s.position, 12.5);
        assert_eq!(s.apply("time-pos", Prop::Double(-0.02)), Change::Position);
        assert_eq!(s.position, 0.0);
    }

    #[test]
    fn track_ids_from_strings() {
        let mut s = PlayerSnapshot::default();
        assert_eq!(s.apply("aid", Prop::Str("2")), Change::State);
        assert_eq!(s.audio_id, Some(2));
        s.apply("sid", Prop::Str("no"));
        assert_eq!(s.subtitle_id, None);
        s.apply("aid", Prop::Str("auto"));
        assert_eq!(s.audio_id, None);
    }

    #[test]
    fn going_idle_clears_the_file() {
        let mut s = PlayerSnapshot::default();
        s.apply("path", Prop::Str("D:\\a.mkv"));
        s.apply("duration", Prop::Double(3600.0));
        s.apply("track-list", Prop::Str(r#"[{"id":1,"type":"audio"}]"#));
        s.apply("idle-active", Prop::Flag(false));
        assert_eq!(s.tracks.len(), 1);
        s.apply("idle-active", Prop::Flag(true));
        assert!(s.idle);
        assert_eq!(s.path, None);
        assert_eq!(s.duration, None);
        assert!(s.tracks.is_empty());
    }

    #[test]
    fn broken_track_list_keeps_previous_tracks() {
        let mut s = PlayerSnapshot::default();
        s.apply("track-list", Prop::Str(r#"[{"id":1,"type":"audio"}]"#));
        assert_eq!(s.apply("track-list", Prop::Str("{")), Change::Ignored);
        assert_eq!(s.tracks.len(), 1);
    }

    #[test]
    fn hwdec_no_means_software() {
        let mut s = PlayerSnapshot::default();
        s.apply("hwdec-current", Prop::Str("no"));
        assert_eq!(s.hwdec, None);
        s.apply("hwdec-current", Prop::Str("d3d11va"));
        assert_eq!(s.hwdec.as_deref(), Some("d3d11va"));
    }

    #[test]
    fn unknown_properties_are_ignored() {
        let mut s = PlayerSnapshot::default();
        assert_eq!(s.apply("chapter", Prop::Int(2)), Change::Ignored);
        assert_eq!(s.apply("pause", Prop::Str("yes")), Change::Ignored);
    }
}
