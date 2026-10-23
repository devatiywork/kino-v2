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

use super::session::{self, Session};
use super::state::{Change, ObservedFormat, PlayerSnapshot, Prop, OBSERVED};
use super::tracks::{parse_track_list, Track, TrackKind};
use crate::library::commands::CHANGED_EVENT;
use crate::library::episode::describe;
use crate::library::track_pref::{choose, Choice};
use crate::library::Library;

pub const STATE_EVENT: &str = "player://state";
pub const POSITION_EVENT: &str = "player://position";
/// Something the user should know: a remembered track is missing in this file
pub const NOTICE_EVENT: &str = "player://notice";

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
                        // Pausing (also leaving the player) and reaching the end save right away
                        if (name == "pause" && state.paused) || (name == "eof-reached" && state.eof) {
                            save_now(ctx, name == "pause");
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
        s.series_title = info.series.as_ref().map(|(_, title)| title.clone());
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
            if let Some(key) = &file.series_key {
                apply_track_memory(ctx, key, &tracks);
            }
            *session::lock(&ctx.session) = Some(Session::new(file.id, file.series_key));
            emit(&ctx.app, CHANGED_EVENT, ());
        }
        Err(e) => eprintln!("[library] register: {e}"),
    }
}

/// SPEC 3.3: tracks are reset per file; the remembered ones are applied once the new
/// file's track list is known, by language and title only
fn apply_track_memory(ctx: &Context, series_key: &str, tracks: &[Track]) {
    let prefs = match ctx.library.series_prefs(series_key) {
        Ok(prefs) => prefs,
        Err(e) => return eprintln!("[library] series prefs: {e}"),
    };
    for (kind, pref, property) in [(TrackKind::Audio, &prefs.audio, "aid"), (TrackKind::Sub, &prefs.sub, "sid")] {
        let Some(pref) = pref else { continue };
        let id = match choose(tracks, kind, pref) {
            Choice::Select(id) => Some(id),
            Choice::Off => None,
            Choice::Fallback { id, wanted, chosen } => {
                emit(&ctx.app, NOTICE_EVENT, Notice::TrackNotFound { track: kind, wanted, chosen });
                id
            }
        };
        let result = match id {
            Some(id) => ctx.client.set_property(property, id),
            None => ctx.client.set_property(property, "no"),
        };
        if let Err(e) = result {
            eprintln!("[player] {property}: {e}");
        }
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
