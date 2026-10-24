//! mpv event loop on its own thread: property changes → snapshot → events for the renderer;
//! the library learns about opened files, positions and track memory from here

use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use libmpv2::events::{Event, PropertyData};
use libmpv2::{Format, Mpv};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::power::KeepAwake;
use super::session::{self, Session};
use super::state::{Change, ObservedFormat, PlayerSnapshot, Prop, OBSERVED};
use super::track_defaults::{self, SubtitleChoice};
use super::tracks::{parse_track_list, Track, TrackKind};
use crate::library::commands::CHANGED_EVENT;
use crate::library::episode::describe;
use crate::library::track_pref::{choose, Choice, TrackPref};
use crate::library::Library;
use crate::settings::SettingsStore;

pub const STATE_EVENT: &str = "player://state";
pub const POSITION_EVENT: &str = "player://position";
/// Something the user should know: a remembered track is missing in this file
pub const NOTICE_EVENT: &str = "player://notice";
/// The next episode started by itself
pub const AUTOPLAY_EVENT: &str = "player://autoplay";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Autoplay {
    pub resumed_from: Option<f64>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
}

/// time-pos changes every frame; the renderer needs ~10 updates a second
const POSITION_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum Notice {
    /// «Дорожка "LostFilm" не найдена, выбрана: English»
    TrackNotFound { track: TrackKind, wanted: String, chosen: Option<String> },
}

pub fn lock(snapshot: &Mutex<PlayerSnapshot>) -> MutexGuard<'_, PlayerSnapshot> {
    snapshot.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Everything the event thread works with. Lock order: session, then snapshot
pub struct Context {
    pub app: AppHandle,
    pub client: Mpv,
    pub snapshot: Arc<Mutex<PlayerSnapshot>>,
    pub session: Arc<Mutex<Option<Session>>>,
    pub library: Arc<Library>,
    pub settings: Arc<SettingsStore>,
    pub awake: Arc<KeepAwake>,
}

pub fn spawn(ctx: Context) -> libmpv2::Result<()> {
    for (id, (name, format)) in OBSERVED.iter().enumerate() {
        let format = match format {
            ObservedFormat::Str => Format::String,
            ObservedFormat::Flag => Format::Flag,
            ObservedFormat::Double => Format::Double,
        };
        ctx.client.observe_property(name, format, id as u64)?;
    }
    thread::Builder::new().name("mpv-events".into()).spawn(move || run(&ctx)).expect("spawn mpv event thread");
    Ok(())
}

fn run(ctx: &Context) {
    let mut last_position = Instant::now() - POSITION_INTERVAL;
    loop {
        // None: timeout or a property that became unavailable
        let Some(event) = ctx.client.wait_event(1.0) else { continue };
        match event {
            Ok(Event::Shutdown) => {
                finish(ctx);
                break;
            }
            // Not StartFile: property changes of the new file can be delivered before it, so
            // clearing there would wipe the new path. Fresh values are read on FileLoaded;
            // going idle clears the file (state.rs)
            Ok(Event::EndFile(_)) => finish(ctx),
            Ok(Event::FileLoaded) => file_loaded(ctx),
            Ok(Event::Seek) | Ok(Event::PlaybackRestart) => {
                last_position = Instant::now();
                emit(&ctx.app, POSITION_EVENT, lock(&ctx.snapshot).position);
            }
            Ok(Event::PropertyChange { name, change, .. }) => {
                let prop = match change {
                    PropertyData::Str(v) | PropertyData::OsdStr(v) => Prop::Str(v),
                    PropertyData::Flag(v) => Prop::Flag(v),
                    PropertyData::Int64(v) => Prop::Int(v),
                    PropertyData::Double(v) => Prop::Double(v),
                };
                let mut s = lock(&ctx.snapshot);
                match s.apply(name, prop) {
                    Change::Position => {
                        let (position, paused) = (s.position, s.paused);
                        drop(s);
                        if paused || last_position.elapsed() >= POSITION_INTERVAL {
                            last_position = Instant::now();
                            emit(&ctx.app, POSITION_EVENT, position);
                        }
                        on_progress(ctx, position);
                    }
                    Change::State => {
                        let state = s.clone();
                        drop(s);
                        emit(&ctx.app, STATE_EVENT, state.clone());
                        ctx.awake.set(state.is_playing() && ctx.settings.read(|s| s.keep_awake));
                        // Pausing (also leaving the player) and reaching the end save right away
                        if (name == "pause" && state.paused) || (name == "eof-reached" && state.eof) {
                            save_now(ctx, name == "pause");
                        }
                        if name == "eof-reached" && state.eof {
                            autoplay_next(ctx);
                        }
                    }
                    Change::Ignored => {}
                }
            }
            Ok(_) => {}
            Err(e) => eprintln!("[player] event: {e}"),
        }
    }
}

/// A file is open: authoritative file fields into the snapshot, the file into the library,
/// the series' track memory onto its tracks
fn file_loaded(ctx: &Context) {
    let path: String = match ctx.client.get_property("path") {
        Ok(path) => path,
        Err(e) => return eprintln!("[player] path: {e}"),
    };
    let duration = ctx.client.get_property::<f64>("duration").ok();
    let tracks = match ctx.client.get_property::<String>("track-list").map(|json| parse_track_list(&json)) {
        Ok(Ok(tracks)) => tracks,
        Ok(Err(e)) => {
            eprintln!("[player] track-list: {e}");
            Vec::new()
        }
        Err(e) => {
            eprintln!("[player] track-list: {e}");
            Vec::new()
        }
    };
    let info = describe(Path::new(&path));
    let state = {
        let mut s = lock(&ctx.snapshot);
        s.path = Some(path.clone());
        s.title = Some(info.title.clone());
        s.series_key = info.series.as_ref().map(|(key, _)| key.clone());
        s.series_title = info.series.as_ref().map(|(_, title)| title.clone());
        s.has_prev = false;
        s.has_next = false;
        s.season = info.season;
        s.episode = info.episode;
        s.duration = duration;
        s.tracks = tracks.clone();
        s.idle = false;
        s.eof = false;
        s.clone()
    };
    emit(&ctx.app, STATE_EVENT, state);

    match ctx.library.register(&path, &info, duration) {
        Ok(file) => {
            choose_tracks(ctx, file.series_key.as_deref(), &tracks);
            *session::lock(&ctx.session) = Some(Session::new(file.id, file.series_key));
            emit(&ctx.app, CHANGED_EVENT, ());
            update_neighbors(&ctx.app, &ctx.library, &ctx.snapshot, file.id);
            // The other episodes: the series folder is scanned once per run, off this thread
            if let Some(dir) = info.series_dir.filter(|d| ctx.library.needs_scan(d)) {
                let (app, library, snapshot, session) = (ctx.app.clone(), ctx.library.clone(), ctx.snapshot.clone(), ctx.session.clone());
                let spawned = thread::Builder::new().name("series-scan".into()).spawn(move || {
                    if let Err(e) = library.scan_dir(Path::new(&dir), None) {
                        return eprintln!("[library] scan {dir}: {e}");
                    }
                    emit(&app, CHANGED_EVENT, ());
                    let current = session::lock(&session).as_ref().map(|s| s.file_id);
                    if current == Some(file.id) {
                        update_neighbors(&app, &library, &snapshot, file.id);
                    }
                });
                if let Err(e) = spawned {
                    eprintln!("[library] scan thread: {e}");
                }
            }
        }
        Err(e) => eprintln!("[library] register: {e}"),
    }
}

/// Whether there are episodes before and after the open one (N / P, the buttons)
fn update_neighbors(app: &AppHandle, library: &Library, snapshot: &Mutex<PlayerSnapshot>, file_id: i64) {
    let exists = |step| match library.neighbor(file_id, step, false) {
        Ok(found) => found.is_some(),
        Err(e) => {
            eprintln!("[library] neighbor: {e}");
            false
        }
    };
    let (has_prev, has_next) = (exists(-1), exists(1));
    let state = {
        let mut s = lock(snapshot);
        s.has_prev = has_prev;
        s.has_next = has_next;
        s.clone()
    };
    emit(app, STATE_EVENT, state);
}

/// SPEC 3.3: the episode ended — the next one of the same season starts; at the end of the
/// season playback stops on the last frame
fn autoplay_next(ctx: &Context) {
    if !ctx.settings.read(|s| s.autoplay) {
        return;
    }
    let Some(file_id) = session::lock(&ctx.session).as_ref().map(|s| s.file_id) else { return };
    let next = match ctx.library.neighbor(file_id, 1, true) {
        Ok(Some(next)) => next,
        Ok(None) => return,
        Err(e) => return eprintln!("[library] next episode: {e}"),
    };
    match super::load(&ctx.client, &ctx.library, &ctx.settings, &next.path) {
        Ok(opened) => emit(&ctx.app, AUTOPLAY_EVENT, Autoplay { resumed_from: opened.resumed_from, season: next.season, episode: next.episode }),
        Err(e) => eprintln!("[player] autoplay: {e}"),
    }
}

/// SPEC 3.3: tracks are reset per file and chosen once the new file's track list is known.
/// The series memory comes first (by language and title only); where nothing is remembered,
/// the settings' preferred audio and the subtitles for a Russian dub (SPEC 6)
fn choose_tracks(ctx: &Context, series_key: Option<&str>, tracks: &[Track]) {
    let prefs = match series_key.map(|key| ctx.library.series_prefs(key)).transpose() {
        Ok(prefs) => prefs.unwrap_or_default(),
        Err(e) => {
            eprintln!("[library] series prefs: {e}");
            Default::default()
        }
    };
    let (preferred_audio, russian_subs) = ctx.settings.read(|s| (s.preferred_audio, s.russian_audio_subtitles));

    let mut audio = tracks.iter().find(|t| t.kind == TrackKind::Audio && t.is_selected).map(|t| t.id);
    match &prefs.audio {
        Some(pref) => audio = apply_memory(ctx, tracks, TrackKind::Audio, pref),
        None => {
            if let Some(id) = track_defaults::audio(tracks, preferred_audio) {
                select(ctx, "aid", Some(id));
                audio = Some(id);
            }
        }
    }
    match &prefs.sub {
        Some(pref) => {
            apply_memory(ctx, tracks, TrackKind::Sub, pref);
        }
        None => {
            let playing = audio.and_then(|id| tracks.iter().find(|t| t.kind == TrackKind::Audio && t.id == id));
            match track_defaults::subtitles(tracks, playing, russian_subs) {
                SubtitleChoice::Keep => {}
                SubtitleChoice::Off => select(ctx, "sid", None),
                SubtitleChoice::Select(id) => select(ctx, "sid", Some(id)),
            }
        }
    }
}

/// The remembered track of a series in this file; returns what got selected
fn apply_memory(ctx: &Context, tracks: &[Track], kind: TrackKind, pref: &TrackPref) -> Option<i64> {
    let id = match choose(tracks, kind, pref) {
        Choice::Select(id) => Some(id),
        Choice::Off => None,
        Choice::Fallback { id, wanted, chosen } => {
            emit(&ctx.app, NOTICE_EVENT, Notice::TrackNotFound { track: kind, wanted, chosen });
            id
        }
    };
    select(ctx, if kind == TrackKind::Audio { "aid" } else { "sid" }, id);
    id
}

/// `aid` / `sid`: a track of this file, or none
fn select(ctx: &Context, property: &str, id: Option<i64>) {
    let result = match id {
        Some(id) => ctx.client.set_property(property, id),
        None => ctx.client.set_property(property, "no"),
    };
    if let Err(e) = result {
        eprintln!("[player] {property}: {e}");
    }
}

/// Periodic save while playing, and the first frame for the card
fn on_progress(ctx: &Context, position: f64) {
    let mut guard = session::lock(&ctx.session);
    let Some(s) = guard.as_mut() else { return };
    if s.wants_first_thumb(position) {
        session::take_thumb(&ctx.client, &ctx.library, s);
    }
    if s.save_due() {
        let state = lock(&ctx.snapshot).clone();
        if session::save(&ctx.library, s, &state) {
            emit(&ctx.app, CHANGED_EVENT, ());
        }
    }
}

fn save_now(ctx: &Context, with_thumb: bool) {
    let mut guard = session::lock(&ctx.session);
    let Some(s) = guard.as_mut() else { return };
    if with_thumb {
        session::take_thumb(&ctx.client, &ctx.library, s);
    }
    let state = lock(&ctx.snapshot).clone();
    if session::save(&ctx.library, s, &state) {
        emit(&ctx.app, CHANGED_EVENT, ());
    }
}

/// The file is closed: last save, the viewing is over
fn finish(ctx: &Context) {
    let Some(mut s) = session::lock(&ctx.session).take() else { return };
    let state = lock(&ctx.snapshot).clone();
    if session::save(&ctx.library, &mut s, &state) {
        emit(&ctx.app, CHANGED_EVENT, ());
    }
}

fn emit<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(e) = app.emit(event, payload) {
        eprintln!("[player] emit {event}: {e}");
    }
}
