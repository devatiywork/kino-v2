//! Track memory for a series (SPEC 3.3): the chosen audio and subtitles are matched in the
//! next episodes by language and title only — never by track number.

use crate::player::tracks::{Track, TrackKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrackPref {
    /// `external`: the track came from a file next to the video (a dub folder, .srt) —
    /// it tells apart tracks that have neither a title nor a language
    Track { lang: Option<String>, title: Option<String>, external: bool },
    /// No sound / subtitles off
    Off,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Choice {
    Select(i64),
    Off,
    /// The remembered track is not in this file: `id` is what got selected instead
    Fallback { id: Option<i64>, wanted: String, chosen: Option<String> },
}

impl TrackPref {
    pub fn of(track: &Track) -> Self {
        TrackPref::Track { lang: track.lang.clone(), title: track.title.clone(), external: track.is_external }
    }
}

/// Words of a track title without codec, channels and bitrate:
/// "DD 5.1 @ 640 kbps (AVO Goblin)" and "AC3 5.1 @ 448 kbps (AVO Goblin)" → "avo goblin"
pub fn normalize_title(title: &str) -> Option<String> {
    const NOISE: &[&str] = &[
        "dd", "ddp", "ac3", "eac3", "dts", "hd", "ma", "x", "es", "aac", "lc", "mp3", "flac", "opus", "vorbis", "truehd",
        "atmos", "pcm", "lpcm", "kbps", "kbit", "kb", "mbps", "khz", "hz", "bit", "ch", "stereo", "mono", "srt", "ass", "ssa",
        "pgs", "sup", "vobsub", "subrip", "full", "forced",
    ];
    let words: Vec<String> = title
        .split(|ch: char| !ch.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|w| !w.is_empty() && !w.chars().all(|ch| ch.is_ascii_digit()) && !NOISE.contains(&w.as_str()))
        .collect();
    (!words.is_empty()).then(|| words.join(" "))
}

/// Containers say "rus", file names say "ru": compare in one form
fn normalize_lang(lang: &str) -> String {
    let lang = lang.to_lowercase();
    let three = match lang.as_str() {
        "ru" => "rus",
        "en" => "eng",
        "uk" => "ukr",
        "ja" => "jpn",
        "de" | "deu" => "ger",
        "fr" | "fra" => "fre",
        "es" => "spa",
        "it" => "ita",
        "ko" => "kor",
        "zh" | "zho" => "chi",
        other => other,
    };
    three.to_string()
}

fn same_lang(a: Option<&str>, b: Option<&str>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => normalize_lang(a) == normalize_lang(b),
        _ => true,
    }
}

fn label(track: &Track) -> Option<String> {
    track.title.clone().or_else(|| track.lang.clone())
}

pub fn choose(tracks: &[Track], kind: TrackKind, pref: &TrackPref) -> Choice {
    let (lang, title, external) = match pref {
        TrackPref::Off => return Choice::Off,
        TrackPref::Track { lang, title, external } => (lang.as_deref(), title.as_deref(), *external),
    };
    let candidates: Vec<&Track> = tracks.iter().filter(|t| t.kind == kind).collect();
    let wanted_title = title.and_then(normalize_title);

    let found = match (&wanted_title, lang) {
        (Some(want), _) => {
            let by_title = |t: &&&Track| t.title.as_deref().and_then(normalize_title).as_ref() == Some(want);
            candidates
                .iter()
                .find(|t| by_title(t) && same_lang(lang, t.lang.as_deref()))
                .or_else(|| candidates.iter().find(by_title))
        }
        // No meaningful title: the language decides
        (None, Some(l)) => candidates.iter().find(|t| t.lang.as_deref().is_some_and(|tl| same_lang(Some(l), Some(tl)))),
        // Neither title nor language (a plain mp4): the same kind of anonymous track
        (None, None) => candidates
            .iter()
            .find(|t| t.is_external == external && t.lang.is_none() && t.title.as_deref().and_then(normalize_title).is_none()),
    };
    if let Some(track) = found {
        return Choice::Select(track.id);
    }

    let wanted = title.or(lang).unwrap_or("?").to_string();
    // No match: audio falls back to the first track, subtitles are turned off
    let fallback = if kind == TrackKind::Audio { candidates.first().copied() } else { None };
    Choice::Fallback { id: fallback.map(|t| t.id), wanted, chosen: fallback.and_then(label) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(id: i64, kind: TrackKind, lang: Option<&str>, title: Option<&str>) -> Track {
        Track {
            id,
            kind,
            title: title.map(Into::into),
            lang: lang.map(Into::into),
            codec: None,
            channels: None,
            is_default: false,
            is_forced: false,
            is_external: false,
            is_selected: false,
        }
    }

    fn episode() -> Vec<Track> {
        vec![
            track(1, TrackKind::Video, None, None),
            track(1, TrackKind::Audio, Some("rus"), Some("AC3 5.1 @ 448 kbps (MVO Novamedia)")),
            track(2, TrackKind::Audio, Some("rus"), Some("AC3 5.1 @ 448 kbps (AVO Goblin)")),
            track(3, TrackKind::Audio, Some("eng"), Some("AC3 5.1 @ 448 kbps (English)")),
            track(1, TrackKind::Sub, Some("rus"), Some("SRT (Novamedia)")),
            track(2, TrackKind::Sub, Some("en"), None),
        ]
    }

    #[test]
    fn title_without_codec_and_bitrate() {
        assert_eq!(normalize_title("DD 5.1 @ 640 kbps (AVO Goblin)").as_deref(), Some("avo goblin"));
        assert_eq!(normalize_title("AC3 5.1 @ 448 kbps (AVO Goblin)").as_deref(), Some("avo goblin"));
        assert_eq!(normalize_title("LostFilm").as_deref(), Some("lostfilm"));
        assert_eq!(normalize_title("AC3 5.1"), None);
        assert_eq!(normalize_title("SRT"), None);
    }

    #[test]
    fn same_dub_in_the_next_episode_has_another_number_and_bitrate() {
        let pref = TrackPref::Track { lang: Some("rus".into()), title: Some("DD 5.1 @ 640 kbps (AVO Goblin)".into()), external: false };
        assert_eq!(choose(&episode(), TrackKind::Audio, &pref), Choice::Select(2));
    }

    #[test]
    fn untitled_track_is_matched_by_language_ru_equals_rus() {
        let pref = TrackPref::Track { lang: Some("eng".into()), title: None, external: false };
        assert_eq!(choose(&episode(), TrackKind::Sub, &pref), Choice::Select(2));
    }

    #[test]
    fn missing_dub_falls_back_to_the_first_audio_track() {
        let pref = TrackPref::Track { lang: Some("rus".into()), title: Some("LostFilm".into()), external: false };
        assert_eq!(
            choose(&episode(), TrackKind::Audio, &pref),
            Choice::Fallback { id: Some(1), wanted: "LostFilm".into(), chosen: Some("AC3 5.1 @ 448 kbps (MVO Novamedia)".into()) }
        );
    }

    #[test]
    fn missing_subtitles_are_turned_off() {
        let pref = TrackPref::Track { lang: Some("ukr".into()), title: Some("Ukrainian (Full)".into()), external: false };
        assert_eq!(choose(&episode(), TrackKind::Sub, &pref), Choice::Fallback { id: None, wanted: "Ukrainian (Full)".into(), chosen: None });
    }

    #[test]
    fn off_stays_off() {
        assert_eq!(choose(&episode(), TrackKind::Sub, &TrackPref::Off), Choice::Off);
    }

    #[test]
    fn anonymous_track_is_matched_as_the_same_kind_of_anonymous_track() {
        // a plain mp4: the embedded audio has neither title nor language; a dub file lies next to it
        let tracks = vec![
            track(1, TrackKind::Audio, None, None),
            Track { is_external: true, ..track(2, TrackKind::Audio, None, Some("English.mka")) },
        ];
        let embedded = TrackPref::Track { lang: None, title: None, external: false };
        assert_eq!(choose(&tracks, TrackKind::Audio, &embedded), Choice::Select(1));
        let codec_only = TrackPref::Track { lang: None, title: Some("AAC 2.0".into()), external: false };
        assert_eq!(choose(&tracks, TrackKind::Audio, &codec_only), Choice::Select(1));
    }

    #[test]
    fn never_by_number() {
        // Track 2 was Goblin in the last episode; here 2 is something else and Goblin is absent
        let tracks = vec![
            track(1, TrackKind::Audio, Some("rus"), Some("MVO Novamedia")),
            track(2, TrackKind::Audio, Some("eng"), Some("English")),
        ];
        let pref = TrackPref::Track { lang: Some("rus".into()), title: Some("AVO Goblin".into()), external: false };
        assert!(matches!(choose(&tracks, TrackKind::Audio, &pref), Choice::Fallback { id: Some(1), .. }));
    }
}
