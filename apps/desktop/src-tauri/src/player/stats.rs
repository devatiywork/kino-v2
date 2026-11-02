//! «Статистика воспроизведения»: what mpv actually does with the open file — the decoder, the
//! frame's format and colours, the HDR metadata, what goes out to the display, the dropped
//! frames, the sound. Read on request (the panel asks once a second while it is open)

use libmpv2::{GetData, Mpv};
use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStats {
    /// mpv's hwdec-current: «d3d11va», «nvdec»… «no» — the processor decodes
    pub decoder: Option<String>,
    pub codec: Option<String>,
    /// The decoded frame's format: «p010» (10 bit) behind a hardware surface, «yuv420p»…
    pub pixel_format: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub fps: Option<f64>,
    /// The file's colours: «bt.2020», «pq», «bt.2020-ncl», «limited»
    pub primaries: Option<String>,
    pub transfer: Option<String>,
    pub matrix: Option<String>,
    pub levels: Option<String>,
    /// HDR metadata, nits: the mastering display's peak, MaxCLL, MaxFALL
    pub max_luma: Option<f64>,
    pub max_cll: Option<f64>,
    pub max_fall: Option<f64>,
    /// What is rendered for the display: «pq» / «bt.2020» is HDR out, «gamma2.2» / «bt.709» SDR
    pub out_primaries: Option<String>,
    pub out_transfer: Option<String>,
    pub out_peak: Option<f64>,
    pub vo: Option<String>,
    pub gpu_api: Option<String>,
    pub display_fps: Option<f64>,
    pub video_sync: Option<String>,
    pub interpolation: Option<bool>,
    /// Frames dropped by the output, by the decoder, shown late or mistimed
    pub dropped: Option<i64>,
    pub decoder_dropped: Option<i64>,
    pub delayed: Option<i64>,
    pub mistimed: Option<i64>,
    pub audio_codec: Option<String>,
    /// The file's channels and what goes out (passthrough shows a «spdif-…» format)
    pub audio_channels: Option<i64>,
    pub audio_out_channels: Option<i64>,
    pub audio_out_format: Option<String>,
    pub audio_out: Option<String>,
}

fn get<T: GetData>(mpv: &Mpv, name: &str) -> Option<T> {
    mpv.get_property::<T>(name).ok()
}

/// A text property, «no» and empty as nothing
fn text(mpv: &Mpv, name: &str) -> Option<String> {
    get::<String>(mpv, name).filter(|s| !s.is_empty())
}

/// Metadata of 0 is «not given», not «dark»
fn nits(mpv: &Mpv, name: &str) -> Option<f64> {
    get::<f64>(mpv, name).filter(|v| *v > 0.0)
}

pub fn read(mpv: &Mpv) -> PlayerStats {
    PlayerStats {
        decoder: text(mpv, "hwdec-current"),
        codec: text(mpv, "video-format"),
        pixel_format: text(mpv, "video-params/hw-pixelformat").or_else(|| text(mpv, "video-params/pixelformat")),
        width: get(mpv, "video-params/w"),
        height: get(mpv, "video-params/h"),
        fps: get(mpv, "container-fps"),
        primaries: text(mpv, "video-params/primaries"),
        transfer: text(mpv, "video-params/gamma"),
        matrix: text(mpv, "video-params/colormatrix"),
        levels: text(mpv, "video-params/colorlevels"),
        max_luma: nits(mpv, "video-params/max-luma"),
        max_cll: nits(mpv, "video-params/max-cll"),
        max_fall: nits(mpv, "video-params/max-fall"),
        out_primaries: text(mpv, "video-target-params/primaries"),
        out_transfer: text(mpv, "video-target-params/gamma"),
        out_peak: nits(mpv, "video-target-params/max-luma"),
        vo: text(mpv, "current-vo"),
        gpu_api: text(mpv, "current-gpu-context"),
        display_fps: get(mpv, "display-fps"),
        video_sync: text(mpv, "video-sync"),
        interpolation: get(mpv, "interpolation"),
        dropped: get(mpv, "frame-drop-count"),
        decoder_dropped: get(mpv, "decoder-frame-drop-count"),
        delayed: get(mpv, "vo-delayed-frame-count"),
        mistimed: get(mpv, "mistimed-frame-count"),
        audio_codec: text(mpv, "audio-codec-name"),
        audio_channels: get(mpv, "audio-params/channel-count"),
        audio_out_channels: get(mpv, "audio-out-params/channel-count"),
        audio_out_format: text(mpv, "audio-out-params/format"),
        audio_out: text(mpv, "current-ao"),
    }
}
