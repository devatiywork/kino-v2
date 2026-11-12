//! «Пауза, когда вы отходите» (SPEC 3.1): the webcam tells whether someone is in front of the
//! screen. A thread of its own looks once a second while a video plays: nobody for the chosen
//! time — the video pauses back where the viewer still watched; with «Продолжать, когда вернётесь»
//! a face back resumes it. The camera is on only while it is needed: never while the setting is
//! off, nothing is open or the user paused by hand.
//!
//! KINO_TEST_PRESENCE — a file instead of the webcam («away» — nobody, anything else or no file —
//! someone): the E2E tests never turn the camera on

pub mod camera;
pub mod commands;
pub mod watch;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use libmpv2::Mpv;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::player::events::{lock, Notice, NOTICE_EVENT};
use crate::player::{PlayerSnapshot, Stopped};
use crate::settings::SettingsStore;
use camera::{CameraError, FaceCamera};
use watch::{Act, Look, Watch};

const LOOK_EVERY: Duration = Duration::from_secs(1);
/// A camera that would not open is tried again after this
const RETRY_AFTER: Duration = Duration::from_secs(60);

/// Faces in front of the screen: the webcam, or the tests' file
pub trait FaceSource {
    fn name(&self) -> &str;
    /// Faces now; None — no frame yet
    fn faces(&self) -> Result<Option<usize>, CameraError>;
}

impl FaceSource for FaceCamera {
    fn name(&self) -> &str {
        FaceCamera::name(self)
    }

    fn faces(&self) -> Result<Option<usize>, CameraError> {
        FaceCamera::faces(self)
    }
}

/// KINO_TEST_PRESENCE: «away» in the file — nobody
pub struct TestFaces(PathBuf);

impl FaceSource for TestFaces {
    fn name(&self) -> &str {
        "test"
    }

    fn faces(&self) -> Result<Option<usize>, CameraError> {
        let away = std::fs::read_to_string(&self.0).is_ok_and(|text| text.trim() == "away");
        Ok(Some(if away { 0 } else { 1 }))
    }
}

/// The tests' file, or the webcam. On the calling thread, which must be in the multithreaded apartment
pub fn open_source() -> Result<Box<dyn FaceSource>, CameraError> {
    if let Some(file) = std::env::var_os("KINO_TEST_PRESENCE") {
        return Ok(Box::new(TestFaces(PathBuf::from(file))));
    }
    Ok(Box::new(FaceCamera::open()?))
}

/// The thread joins the multithreaded apartment: WinRT's camera and face detector want it
pub fn enter_apartment() {
    // SAFETY: the calling thread's own COM state; «already initialized» is fine
    if let Err(e) = unsafe { windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED) } {
        eprintln!("[presence] apartment: {e}");
    }
}

/// Why the camera is not there, as the renderer words it
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Unavailable {
    NoCamera,
    Denied,
    NoDetector,
    Other,
}

impl From<&CameraError> for Unavailable {
    fn from(e: &CameraError) -> Self {
        match e {
            CameraError::NoCamera => Unavailable::NoCamera,
            CameraError::Denied => Unavailable::Denied,
            CameraError::NoDetector => Unavailable::NoDetector,
            CameraError::Other(_) => Unavailable::Other,
        }
    }
}

pub struct Context {
    pub app: AppHandle,
    /// A client of the player's mpv of its own
    pub client: Mpv,
    pub snapshot: Arc<Mutex<PlayerSnapshot>>,
    pub settings: Arc<SettingsStore>,
    pub stopped: Arc<Stopped>,
}

pub fn spawn(ctx: Context) {
    let spawned = thread::Builder::new().name("presence".into()).spawn(move || {
        enter_apartment();
        run(&ctx);
    });
    if let Err(e) = spawned {
        eprintln!("[presence] thread: {e}");
    }
}

fn run(ctx: &Context) {
    let mut watch = Watch::default();
    let mut source: Option<Box<dyn FaceSource>> = None;
    let mut failed_at: Option<Instant> = None;
    while !ctx.stopped.is_set() {
        thread::sleep(LOOK_EVERY);
        let (on, resume, away_after) = ctx.settings.read(|s| (s.away_pause, s.away_resume, Duration::from_secs(s.away_after.into())));
        let (loaded, playing, position) = {
            let s = lock(&ctx.snapshot);
            let loaded = s.path.is_some() && !s.idle;
            (loaded, loaded && !s.paused && !s.eof, s.position)
        };
        if !on || !loaded || !watch.wants_camera(playing, resume) {
            // The camera goes off
            source = None;
            watch.reset();
            continue;
        }
        if source.is_none() {
            if failed_at.is_some_and(|at| at.elapsed() < RETRY_AFTER) {
                continue;
            }
            match open_source() {
                Ok(opened) => {
                    source = Some(opened);
                    failed_at = None;
                }
                Err(e) => {
                    eprintln!("[presence] camera: {e}");
                    failed_at = Some(Instant::now());
                    notify(ctx, Notice::CameraUnavailable { reason: Unavailable::from(&e) });
                    continue;
                }
            }
        }
        let faces = match source.as_ref().map(|s| s.faces()) {
            Some(Ok(Some(faces))) => faces,
            Some(Ok(None)) | None => continue,
            Some(Err(e)) => {
                eprintln!("[presence] frame: {e}");
                source = None;
                continue;
            }
        };
        let look = Look { now: Instant::now(), face: faces > 0, playing, position };
        match watch.observe(look, away_after, resume) {
            Act::Pause { back_to } => {
                let paused = ctx.client.set_property("pause", true).and_then(|()| ctx.client.command("seek", &[&back_to.to_string(), "absolute+exact"]));
                if let Err(e) = paused {
                    eprintln!("[presence] pause: {e}");
                }
                notify(ctx, Notice::AwayPaused);
            }
            Act::Resume => {
                if let Err(e) = ctx.client.set_property("pause", false) {
                    eprintln!("[presence] resume: {e}");
                }
                notify(ctx, Notice::AwayResumed);
            }
            Act::None => {}
        }
    }
}

fn notify(ctx: &Context, notice: Notice) {
    if let Err(e) = ctx.app.emit(NOTICE_EVENT, notice) {
        eprintln!("[presence] emit: {e}");
    }
}
