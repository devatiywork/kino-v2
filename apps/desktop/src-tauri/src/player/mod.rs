//! Player module: libmpv in-process, video in a child window under the WebView2.
//! Uses the library (positions, history, track memory). Knows nothing about torrents.

pub mod commands;
mod events;
mod session;
mod state;
mod track_defaults;
pub(crate) mod tracks;
mod video_host;

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use libmpv2::{Mpv, SetData};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::AppResult;
use crate::library::commands::CHANGED_EVENT;
use crate::library::episode::describe;
use crate::library::track_pref::TrackPref;
use crate::library::Library;
use crate::power::KeepAwake;
use crate::settings::{Settings, SettingsStore};
use session::Session;
pub use state::PlayerSnapshot;
pub use events::STATE_EVENT;
use tracks::TrackKind;
use video_host::VideoHost;

pub const VOLUME_MAX: f64 = 130.0;

/// loadfile from the saved position (SPEC 3.2), unless the settings say to start over —
/// for the open command and for autoplay
pub(crate) fn load(mpv: &Mpv, library: &Library, settings: &SettingsStore, path: &str) -> AppResult<OpenResult> {
    let resumed_from = if settings.read(|s| s.resume) {
        library.resume_position(path).unwrap_or_else(|e| {
            eprintln!("[library] resume: {e}");
            None
        })
    } else {
        None
    };
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
    settings: Arc<SettingsStore>,
    snapshot: Arc<Mutex<PlayerSnapshot>>,
    session: Arc<Mutex<Option<Session>>>,
    awake: Arc<KeepAwake>,
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
    pub fn new(app: &AppHandle, library: Arc<Library>, settings: Arc<SettingsStore>, parent: isize, width: u32, height: u32) -> AppResult<Self> {
        let host = VideoHost::create(parent, width as i32, height as i32)?;
        let initial = settings.get();
        let mpv = Mpv::with_initializer(|init| {
            init.set_option("wid", host.wid())?;
            init.set_option("config", "no")?;
            init.set_option("load-scripts", "no")?;
            init.set_option("ytdl", "no")?;
            init.set_option("vo", "gpu-next")?;
            init.set_option("gpu-api", "d3d11")?;
            init.set_option("hwdec", initial.hwdec())?;
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
            // SPEC 6: what a run starts with, and how subtitles look
            init.set_option("volume", initial.default_volume)?;
            init.set_option("speed", initial.default_speed)?;
            init.set_option("sub-scale", initial.subtitle_size.scale())?;
            init.set_option("sub-pos", initial.subtitle_position.sub_pos())?;
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
            // KINO_TEST_VOLUME — the tests are quiet from the very first frame (a release build too)
            if let Some(volume) = std::env::var("KINO_TEST_VOLUME").ok().and_then(|v| v.parse::<f64>().ok()) {
                init.set_option("volume", volume.clamp(0.0, VOLUME_MAX))?;
            }
            Ok(())
        })?;
        let snapshot = Arc::new(Mutex::new(PlayerSnapshot::default()));
        let session = Arc::new(Mutex::new(None));
        let awake = Arc::new(KeepAwake::for_video());
        events::spawn(events::Context {
            app: app.clone(),
            // No name: libmpv2 6.0 drops the name's CString before mpv_create_client reads it
            // (edition 2024 tail temporaries), mpv returns NULL and the crate unwraps it unchecked
            client: mpv.create_client(None)?,
            snapshot: snapshot.clone(),
            session: session.clone(),
            library: library.clone(),
            settings: settings.clone(),
            awake: awake.clone(),
        })?;
        Ok(Self { mpv, host, app: app.clone(), library, settings, snapshot, session, awake, video_seq: AtomicU64::new(0) })
    }

    pub fn snapshot(&self) -> PlayerSnapshot {
        events::lock(&self.snapshot).clone()
    }

    /// Opens the file, continuing from the saved position when there is one
    pub fn open(&self, path: &str) -> AppResult<OpenResult> {
        load(&self.mpv, &self.library, &self.settings, path)
    }

    /// The previous (`step` −1) or next (+1) episode of the open one, across seasons (N / P)
    pub fn open_neighbor(&self, step: i32) -> AppResult<Option<OpenResult>> {
        let Some(file_id) = session::lock(&self.session).as_ref().map(|s| s.file_id) else { return Ok(None) };
        match self.library.neighbor(file_id, step, false)? {
            Some(file) => Ok(Some(self.open(&file.path)?)),
            None => Ok(None),
        }
    }

    /// SPEC 6: a changed setting takes effect at once. Speed and volume change only when their
    /// default does; read at use: resume, autoplay, preferred tracks, the history
    pub fn apply_settings(&self, old: &Settings, new: &Settings) {
        if old.hardware_decoding != new.hardware_decoding {
            self.set_logged("hwdec", new.hwdec());
        }
        if old.default_volume != new.default_volume {
            self.set_logged("volume", new.default_volume);
        }
        if old.default_speed != new.default_speed {
            self.set_logged("speed", new.default_speed);
        }
        if old.subtitle_size != new.subtitle_size {
            self.set_logged("sub-scale", new.subtitle_size.scale());
        }
        if old.subtitle_position != new.subtitle_position {
            self.set_logged("sub-pos", new.subtitle_position.sub_pos());
        }
        if old.keep_awake != new.keep_awake {
            self.awake.set(new.keep_awake && events::lock(&self.snapshot).is_playing());
        }
    }

    fn set_logged<T: SetData>(&self, name: &str, value: T) {
        if let Err(e) = self.mpv.set_property(name, value) {
            eprintln!("[player] {name}: {e}");
        }
    }

    /// SPEC 6 «Очистить историю». An open file starts a new viewing, as if just opened
    pub fn clear_history(&self) -> AppResult<()> {
        let mut session = session::lock(&self.session);
        self.library.clear_history()?;
        if session.is_some() {
            let (path, duration) = {
                let s = events::lock(&self.snapshot);
                (s.path.clone(), s.duration)
            };
            *session = match path {
                Some(path) => {
                    let file = self.library.register(&path, &describe(Path::new(&path)), duration)?;
                    Some(Session::new(file.id, file.series_key))
                }
                None => None,
            };
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
