//! Tracks of the current file from mpv's `track-list` (JSON when observed as a string)

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackKind {
    Video,
    Audio,
    Sub,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    /// mpv track id — valid only for the current file, never carried to another one
    pub id: i64,
    pub kind: TrackKind,
    pub title: Option<String>,
    pub lang: Option<String>,
    pub codec: Option<String>,
    pub channels: Option<i64>,
    pub is_default: bool,
    pub is_forced: bool,
    pub is_external: bool,
    pub is_selected: bool,
}

#[derive(Deserialize)]
struct RawTrack {
    id: i64,
    #[serde(rename = "type")]
    kind: String,
    title: Option<String>,
    lang: Option<String>,
    codec: Option<String>,
    #[serde(rename = "demux-channel-count")]
    channels: Option<i64>,
    #[serde(default)]
    default: bool,
    #[serde(default)]
    forced: bool,
    #[serde(default)]
    external: bool,
    #[serde(default)]
    selected: bool,
}

/// Parses `track-list`; tracks of unknown types are skipped
pub fn parse_track_list(json: &str) -> Result<Vec<Track>, serde_json::Error> {
    let raw: Vec<RawTrack> = serde_json::from_str(json)?;
    Ok(raw
        .into_iter()
        .filter_map(|t| {
            let kind = match t.kind.as_str() {
                "video" => TrackKind::Video,
                "audio" => TrackKind::Audio,
                "sub" => TrackKind::Sub,
                _ => return None,
            };
            Some(Track {
                id: t.id,
                kind,
                title: t.title.filter(|s| !s.is_empty()),
                lang: t.lang.filter(|s| !s.is_empty()),
                codec: t.codec,
                channels: t.channels,
                is_default: t.default,
                is_forced: t.forced,
                is_external: t.external,
                is_selected: t.selected,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOPRANOS: &str = r#"[
        {"id":1,"type":"video","src-id":0,"default":true,"forced":false,"codec":"h264","external":false,"selected":true,"demux-w":1280,"demux-h":720},
        {"id":1,"type":"audio","src-id":1,"title":"DD 5.1 @ 640 kbps (AVO Goblin)","lang":"rus","default":true,"forced":false,"codec":"ac3","external":false,"selected":true,"demux-channel-count":6},
        {"id":4,"type":"audio","src-id":4,"title":"DD 5.1 @ 640 kbps (English)","lang":"eng","default":false,"forced":false,"codec":"ac3","external":false,"selected":false,"demux-channel-count":6},
        {"id":1,"type":"sub","src-id":6,"title":"SRT (Novamedia)","lang":"rus","default":false,"forced":false,"codec":"subrip","external":false,"selected":false},
        {"id":2,"type":"sub","title":"","external":true,"selected":false,"codec":"ass","external-filename":"C:\\x.ass"}
    ]"#;

    #[test]
    fn parses_video_audio_and_subtitles() {
        let tracks = parse_track_list(SOPRANOS).unwrap();
        assert_eq!(tracks.len(), 5);
        let audio: Vec<_> = tracks.iter().filter(|t| t.kind == TrackKind::Audio).collect();
        assert_eq!(audio.len(), 2);
        assert_eq!(audio[0].lang.as_deref(), Some("rus"));
        assert_eq!(audio[0].channels, Some(6));
        assert!(audio[0].is_selected && audio[0].is_default);
        assert_eq!(audio[1].id, 4);
    }

    #[test]
    fn ids_repeat_across_kinds() {
        // video, audio and sub each count from 1 — a track is (kind, id), not id alone
        let tracks = parse_track_list(SOPRANOS).unwrap();
        assert_eq!(tracks.iter().filter(|t| t.id == 1).count(), 3);
    }

    #[test]
    fn empty_title_and_missing_fields_become_none() {
        let tracks = parse_track_list(SOPRANOS).unwrap();
        let external = tracks.last().unwrap();
        assert_eq!(external.title, None);
        assert_eq!(external.lang, None);
        assert!(external.is_external);
        assert!(!external.is_default);
    }

    #[test]
    fn unknown_types_are_skipped() {
        let tracks = parse_track_list(r#"[{"id":1,"type":"attachment"}]"#).unwrap();
        assert!(tracks.is_empty());
    }

    #[test]
    fn invalid_json_is_an_error() {
        assert!(parse_track_list("not json").is_err());
    }
}
