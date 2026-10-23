//! SPEC 6 «Озвучка и субтитры»: what to choose in a file nothing is remembered for — the
//! preferred audio, and the subtitles that go with a Russian dub. The series track memory
//! (library/track_pref.rs) always wins over these.

use super::tracks::{Track, TrackKind};
use crate::settings::{PreferredAudio, RussianAudioSubtitles};

fn is_cyrillic(text: &str) -> bool {
    text.chars().any(|ch| matches!(ch, 'а'..='я' | 'А'..='Я' | 'ё' | 'Ё'))
}

/// Russian by its language, or by a Cyrillic title when the file names no language
fn is_russian(track: &Track) -> bool {
    match track.lang.as_deref().map(str::to_lowercase).as_deref() {
        Some("ru" | "rus") => true,
        Some("und") | None => track.title.as_deref().is_some_and(is_cyrillic),
        Some(_) => false,
    }
}

/// A known language other than Russian: the original track of a dubbed release
fn is_original(track: &Track) -> bool {
    track.lang.as_deref().is_some_and(|lang| !matches!(lang.to_lowercase().as_str(), "ru" | "rus" | "und"))
}

/// Signs and inscriptions only: the forced flag, or the title says so
fn is_forced(track: &Track) -> bool {
    track.is_forced
        || track.title.as_deref().is_some_and(|title| {
            let title = title.to_lowercase();
            ["forced", "надпис", "signs"].iter().any(|word| title.contains(word))
        })
}

/// The audio track to switch to; None — keep what the file chose
pub fn audio(tracks: &[Track], preferred: PreferredAudio) -> Option<i64> {
    let mut audio = tracks.iter().filter(|t| t.kind == TrackKind::Audio);
    let found = match preferred {
        PreferredAudio::Russian => audio.find(|t| is_russian(t)),
        PreferredAudio::Original => audio.find(|t| is_original(t)),
    };
    found.map(|t| t.id)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubtitleChoice {
    /// Not a Russian dub: what the file chose stays
    Keep,
    Off,
    Select(i64),
}

/// Subtitles for the audio that plays; only a Russian dub has a rule
pub fn subtitles(tracks: &[Track], audio: Option<&Track>, rule: RussianAudioSubtitles) -> SubtitleChoice {
    if !audio.is_some_and(is_russian) {
        return SubtitleChoice::Keep;
    }
    let mut subs = tracks.iter().filter(|t| t.kind == TrackKind::Sub);
    let found = match rule {
        RussianAudioSubtitles::Off => None,
        // Forced tracks often name no language: anything not foreign will do
        RussianAudioSubtitles::Forced => subs.find(|t| is_forced(t) && !is_original(t)),
        RussianAudioSubtitles::Full => subs.find(|t| is_russian(t) && !is_forced(t)),
    };
    found.map_or(SubtitleChoice::Off, |t| SubtitleChoice::Select(t.id))
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

    /// A typical Russian release: the original first, dubs after it, two kinds of subtitles
    fn release() -> Vec<Track> {
        vec![
            track(1, TrackKind::Video, None, None),
            track(1, TrackKind::Audio, Some("eng"), Some("Original")),
            track(2, TrackKind::Audio, Some("rus"), Some("MVO LostFilm")),
            track(3, TrackKind::Audio, None, Some("Дубляж")),
            track(1, TrackKind::Sub, Some("rus"), Some("Надписи")),
            track(2, TrackKind::Sub, Some("rus"), Some("Полные")),
            track(3, TrackKind::Sub, Some("eng"), None),
        ]
    }

    #[test]
    fn preferred_audio() {
        assert_eq!(audio(&release(), PreferredAudio::Russian), Some(2));
        assert_eq!(audio(&release(), PreferredAudio::Original), Some(1));
        let no_lang = [track(1, TrackKind::Audio, None, None)];
        assert_eq!(audio(&no_lang, PreferredAudio::Russian), None, "nothing to prefer — the file decides");
        assert_eq!(audio(&no_lang, PreferredAudio::Original), None);
        let cyrillic = [track(1, TrackKind::Audio, Some("eng"), None), track(2, TrackKind::Audio, None, Some("Дубляж"))];
        assert_eq!(audio(&cyrillic, PreferredAudio::Russian), Some(2), "a Cyrillic title without a language");
    }

    #[test]
    fn subtitles_with_a_russian_dub() {
        let tracks = release();
        let dub = &tracks[2];
        assert_eq!(subtitles(&tracks, Some(dub), RussianAudioSubtitles::Off), SubtitleChoice::Off);
        assert_eq!(subtitles(&tracks, Some(dub), RussianAudioSubtitles::Forced), SubtitleChoice::Select(1));
        assert_eq!(subtitles(&tracks, Some(dub), RussianAudioSubtitles::Full), SubtitleChoice::Select(2));
    }

    #[test]
    fn the_original_audio_keeps_the_files_subtitles() {
        let tracks = release();
        assert_eq!(subtitles(&tracks, Some(&tracks[1]), RussianAudioSubtitles::Off), SubtitleChoice::Keep);
        assert_eq!(subtitles(&tracks, None, RussianAudioSubtitles::Full), SubtitleChoice::Keep);
    }

    #[test]
    fn forced_by_flag_without_a_language_and_nothing_to_choose() {
        let dub = track(1, TrackKind::Audio, Some("ru"), None);
        let mut signs = track(5, TrackKind::Sub, None, None);
        signs.is_forced = true;
        let tracks = vec![dub.clone(), signs, track(6, TrackKind::Sub, Some("eng"), Some("Full"))];
        assert_eq!(subtitles(&tracks, Some(&dub), RussianAudioSubtitles::Forced), SubtitleChoice::Select(5));
        assert_eq!(subtitles(&tracks, Some(&dub), RussianAudioSubtitles::Full), SubtitleChoice::Off, "no full Russian ones");
    }
}
