//! Player module: libmpv in-process, video in a child window under the WebView2.
//! Knows nothing about torrents.

pub mod commands;
mod events;
mod state;
mod tracks;
mod video_host;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use libmpv2::Mpv;
use tauri::AppHandle;

use crate::error::AppResult;
pub use state::PlayerSnapshot;
use video_host::VideoHost;

pub const VOLUME_MAX: f64 = 130.0;

pub struct Player {
    mpv: Mpv,
    host: VideoHost,
    snapshot: Arc<Mutex<PlayerSnapshot>>,
    /// Last applied show/hide request: IPC calls may arrive out of order
    video_seq: AtomicU64,
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SeekMode {
    Absolute,
    Relative,
}

impl Player {
    /// `parent` — HWND of the main window, `width`/`height` — its client area in physical pixels
    pub fn new(app: &AppHandle, parent: isize, width: u32, height: u32) -> AppResult<Self> {
        let host = VideoHost::create(parent, width as i32, height as i32)?;
        let mpv = Mpv::with_initializer(|init| {
            init.set_option("wid", host.wid())?;
            init.set_option("config", "no")?;
            init.set_option("load-scripts", "no")?;
            init.set_option("ytdl", "no")?;
            init.set_option("vo", "gpu-next")?;
            init.set_option("gpu-api", "d3d11")?;
            init.set_option("hwdec", "auto-safe")?;
            init.set_option("idle", "yes")?;
            init.set_option("force-window", "yes")?;
            // Stay on the last frame: the renderer decides what comes next
            init.set_option("keep-open", "yes")?;
            // All input and on-screen UI belong to the page
            init.set_option("input-default-bindings", "no")?;
            init.set_option("input-vo-keyboard", "no")?;
            init.set_option("osc", "no")?;
            init.set_option("osd-level", 0i64)?;
            init.set_option("volume-max", VOLUME_MAX)?;
            // External subtitles and dubs next to the video
            init.set_option("sub-auto", "fuzzy")?;
            init.set_option("audio-file-auto", "fuzzy")?;
            if cfg!(debug_assertions) {
                let log = std::env::temp_dir().join("kino-mpv.log");
                init.set_option("log-file", log.to_string_lossy().as_ref())?;
            }
            Ok(())
        })?;
        let snapshot = Arc::new(Mutex::new(PlayerSnapshot::default()));
        // No name: libmpv2 6.0 drops the name's CString before mpv_create_client reads it
        // (edition 2024 tail temporaries), mpv returns NULL and the crate unwraps it unchecked
        events::spawn(app.clone(), mpv.create_client(None)?, snapshot.clone())?;
        Ok(Self { mpv, host, snapshot, video_seq: AtomicU64::new(0) })
    }

    pub fn snapshot(&self) -> PlayerSnapshot {
        events::lock(&self.snapshot).clone()
    }

    pub fn open(&self, path: &str) -> AppResult<()> {
        self.mpv.command("loadfile", &[path, "replace"])?;
        self.mpv.set_property("pause", false)?;
        Ok(())
    }

    pub fn stop(&self) -> AppResult<()> {
        Ok(self.mpv.command("stop", &[])?)
    }

    pub fn set_paused(&self, paused: bool) -> AppResult<()> {
        Ok(self.mpv.set_property("pause", paused)?)
    }

    pub fn seek(&self, seconds: f64, mode: SeekMode) -> AppResult<()> {
        let mode = match mode {
            SeekMode::Absolute => "absolute+exact",
            SeekMode::Relative => "relative+exact",
        };
        Ok(self.mpv.command("seek", &[&seconds.to_string(), mode])?)
    }

    pub fn set_volume(&self, volume: f64) -> AppResult<()> {
        Ok(self.mpv.set_property("volume", volume.clamp(0.0, VOLUME_MAX))?)
    }

    pub fn set_muted(&self, muted: bool) -> AppResult<()> {
        Ok(self.mpv.set_property("mute", muted)?)
    }

    pub fn set_speed(&self, speed: f64) -> AppResult<()> {
        Ok(self.mpv.set_property("speed", speed.clamp(0.25, 4.0))?)
    }

    /// Track ids belong to the current file only (see tracks.rs)
    pub fn set_audio(&self, id: Option<i64>) -> AppResult<()> {
        Ok(match id {
            Some(id) => self.mpv.set_property("aid", id),
            None => self.mpv.set_property("aid", "no"),
        }?)
    }

    pub fn set_subtitle(&self, id: Option<i64>) -> AppResult<()> {
        Ok(match id {
            Some(id) => self.mpv.set_property("sid", id),
            None => self.mpv.set_property("sid", "no"),
        }?)
    }

    pub fn set_subtitles_visible(&self, visible: bool) -> AppResult<()> {
        Ok(self.mpv.set_property("sub-visibility", visible)?)
    }

    /// Bottom margin of text subtitles in mpv's scaled pixels (720p): lifted above the controls
    pub fn set_subtitle_margin(&self, margin: i64) -> AppResult<()> {
        Ok(self.mpv.set_property("sub-margin-y", margin.clamp(0, 600))?)
    }

    /// `seq` grows with every request from the renderer; an older request is ignored
    pub fn set_video_visible(&self, visible: bool, seq: u64) {
        if self.video_seq.fetch_max(seq, Ordering::SeqCst) > seq {
            return;
        }
        self.host.set_visible(visible);
    }

    pub fn resize_video(&self, width: u32, height: u32) {
        self.host.resize(width as i32, height as i32);
    }

    pub fn shutdown(&self) {
        if let Err(e) = self.mpv.command("quit", &[]) {
            eprintln!("[player] quit: {e}");
        }
    }
}
