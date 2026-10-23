//! Player module: libmpv in-process, video in a child window under the WebView2.
//! Uses the library (positions, history, track memory). Knows nothing about torrents.

pub mod commands;
mod events;
mod session;
mod state;
pub(crate) mod tracks;
mod video_host;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use libmpv2::Mpv;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::AppResult;
use crate::library::commands::CHANGED_EVENT;
use crate::library::track_pref::TrackPref;
use crate::library::Library;
use session::Session;
pub use state::PlayerSnapshot;
use tracks::TrackKind;
use video_host::VideoHost;

pub const VOLUME_MAX: f64 = 130.0;
const AUTOPLAY_SETTING: &str = "player.autoplay";

/// loadfile from the saved position (SPEC 3.2) — for the open command and for autoplay
pub(crate) fn load(mpv: &Mpv, library: &Library, path: &str) -> AppResult<OpenResult> {
    let resumed_from = library.resume_position(path).unwrap_or_else(|e| {
        eprintln!("[library] resume: {e}");
        None
    });
    match resumed_from {
        Some(start) => mpv.command("loadfile", &[path, "replace", "-1", &format!("start={start}")])?,
        None => mpv.command("loadfile", &[path, "replace"])?,
    }
    mpv.set_property("pause", false)?;
    Ok(OpenResult { resumed_from })
}

pub struct Player {
    mpv: Mpv,
    host: VideoHost,
    app: AppHandle,
    library: Arc<Library>,
    snapshot: Arc<Mutex<PlayerSnapshot>>,
    session: Arc<Mutex<Option<Session>>>,
    autoplay: Arc<AtomicBool>,
    /// Last applied show/hide request: IPC calls may arrive out of order
    video_seq: AtomicU64,
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SeekMode {
    Absolute,
    Relative,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    /// The file continues from here (SPEC 3.2: «Продолжено с 23:14 · Начать сначала»)
    pub resumed_from: Option<f64>,
}

impl Player {
    /// `parent` — HWND of the main window, `width`/`height` — its client area in physical pixels
    pub fn new(app: &AppHandle, library: Arc<Library>, parent: isize, width: u32, height: u32) -> AppResult<Self> {
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
            // Frames for the home screen cards
            init.set_option("screenshot-format", "jpg")?;
            init.set_option("screenshot-jpeg-quality", 82i64)?;
            if cfg!(debug_assertions) {
                let log = std::env::temp_dir().join("kino-mpv.log");
                init.set_option("log-file", log.to_string_lossy().as_ref())?;
            }
            Ok(())
        })?;
        let autoplay_on = library.setting(AUTOPLAY_SETTING).ok().flatten().is_none_or(|v| v == "1");
        let autoplay = Arc::new(AtomicBool::new(autoplay_on));
        let snapshot = Arc::new(Mutex::new(PlayerSnapshot { autoplay: autoplay_on, ..PlayerSnapshot::default() }));
        let session = Arc::new(Mutex::new(None));
        events::spawn(events::Context {
            app: app.clone(),
            // No name: libmpv2 6.0 drops the name's CString before mpv_create_client reads it
            // (edition 2024 tail temporaries), mpv returns NULL and the crate unwraps it unchecked
            client: mpv.create_client(None)?,
            snapshot: snapshot.clone(),
            session: session.clone(),
            library: library.clone(),
            autoplay: autoplay.clone(),
        })?;
        Ok(Self { mpv, host, app: app.clone(), library, snapshot, session, autoplay, video_seq: AtomicU64::new(0) })
    }

    pub fn snapshot(&self) -> PlayerSnapshot {
        events::lock(&self.snapshot).clone()
    }

    /// Opens the file, continuing from the saved position when there is one
    pub fn open(&self, path: &str) -> AppResult<OpenResult> {
        load(&self.mpv, &self.library, path)
    }

    /// The previous (`step` −1) or next (+1) episode of the open one, across seasons (N / P)
    pub fn open_neighbor(&self, step: i32) -> AppResult<Option<OpenResult>> {
        let Some(file_id) = session::lock(&self.session).as_ref().map(|s| s.file_id) else { return Ok(None) };
        match self.library.neighbor(file_id, step, false)? {
            Some(file) => Ok(Some(self.open(&file.path)?)),
            None => Ok(None),
        }
    }

    /// Autoplay of the next episode, remembered between runs
    pub fn set_autoplay(&self, enabled: bool) -> AppResult<()> {
        self.library.set_setting(AUTOPLAY_SETTING, if enabled { "1" } else { "0" })?;
        self.autoplay.store(enabled, Ordering::Relaxed);
        let state = {
            let mut s = events::lock(&self.snapshot);
            s.autoplay = enabled;
            s.clone()
        };
        if let Err(e) = self.app.emit(events::STATE_EVENT, state) {
            eprintln!("[player] emit: {e}");
        }
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

    /// Track ids belong to the current file only (see tracks.rs); the choice is remembered
    /// for the series by language and title
    pub fn set_audio(&self, id: Option<i64>) -> AppResult<()> {
        match id {
            Some(id) => self.mpv.set_property("aid", id)?,
            None => self.mpv.set_property("aid", "no")?,
        }
        self.remember(TrackKind::Audio, id);
        Ok(())
    }

    pub fn set_subtitle(&self, id: Option<i64>) -> AppResult<()> {
        match id {
            Some(id) => self.mpv.set_property("sid", id)?,
            None => self.mpv.set_property("sid", "no")?,
        }
        self.remember(TrackKind::Sub, id);
        Ok(())
    }

    fn remember(&self, kind: TrackKind, id: Option<i64>) {
        let Some(series_key) = session::lock(&self.session).as_ref().and_then(|s| s.series_key.clone()) else { return };
        let pref = match id {
            None => TrackPref::Off,
            Some(id) => {
                let snapshot = events::lock(&self.snapshot);
                match snapshot.tracks.iter().find(|t| t.kind == kind && t.id == id) {
                    Some(track) => TrackPref::of(track),
                    None => return,
                }
            }
        };
        if let Err(e) = self.library.save_pref(&series_key, kind, &pref) {
            eprintln!("[library] save track pref: {e}");
        }
    }

    pub fn set_subtitles_visible(&self, visible: bool) -> AppResult<()> {
        Ok(self.mpv.set_property("sub-visibility", visible)?)
    }

    /// Share of the window on the right that the video leaves free (the episode panel)
    pub fn set_right_margin(&self, ratio: f64) -> AppResult<()> {
        Ok(self.mpv.set_property("video-margin-ratio-right", ratio.clamp(0.0, 0.5))?)
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

    /// Save the position now (the window is closing)
    pub fn flush(&self) {
        let mut guard = session::lock(&self.session);
        let Some(s) = guard.as_mut() else { return };
        let state = events::lock(&self.snapshot).clone();
        if session::save(&self.library, s, &state) {
            if let Err(e) = self.app.emit(CHANGED_EVENT, ()) {
                eprintln!("[library] emit: {e}");
            }
        }
    }

    pub fn shutdown(&self) {
        self.flush();
        if let Err(e) = self.mpv.command("quit", &[]) {
            eprintln!("[player] quit: {e}");
        }
    }
}
