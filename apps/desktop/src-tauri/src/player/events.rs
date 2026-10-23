//! mpv event loop on its own thread: property changes → snapshot → events for the renderer

use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use libmpv2::events::{Event, PropertyData};
use libmpv2::{Format, Mpv};
use tauri::{AppHandle, Emitter};

use super::state::{Change, ObservedFormat, PlayerSnapshot, Prop, OBSERVED};

pub const STATE_EVENT: &str = "player://state";
pub const POSITION_EVENT: &str = "player://position";

/// time-pos changes every frame; the renderer needs ~10 updates a second
const POSITION_INTERVAL: Duration = Duration::from_millis(100);

pub fn lock(snapshot: &Mutex<PlayerSnapshot>) -> MutexGuard<'_, PlayerSnapshot> {
    snapshot.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn spawn(app: AppHandle, client: Mpv, snapshot: Arc<Mutex<PlayerSnapshot>>) -> libmpv2::Result<()> {
    for (id, (name, format)) in OBSERVED.iter().enumerate() {
        let format = match format {
            ObservedFormat::Str => Format::String,
            ObservedFormat::Flag => Format::Flag,
            ObservedFormat::Double => Format::Double,
        };
        client.observe_property(name, format, id as u64)?;
    }
    thread::Builder::new()
        .name("mpv-events".into())
        .spawn(move || run(&app, &client, &snapshot))
        .expect("spawn mpv event thread");
    Ok(())
}

fn run(app: &AppHandle, client: &Mpv, snapshot: &Mutex<PlayerSnapshot>) {
    let mut last_position = Instant::now() - POSITION_INTERVAL;
    loop {
        // None: timeout or a property that became unavailable
        let Some(event) = client.wait_event(1.0) else { continue };
        match event {
            Ok(Event::Shutdown) => break,
            Ok(Event::StartFile) => {
                let state = {
                    let mut s = lock(snapshot);
                    s.clear_file();
                    s.clone()
                };
                emit(app, STATE_EVENT, state);
            }
            Ok(Event::Seek) | Ok(Event::PlaybackRestart) => {
                last_position = Instant::now();
                emit(app, POSITION_EVENT, lock(snapshot).position);
            }
            Ok(Event::PropertyChange { name, change, .. }) => {
                let prop = match change {
                    PropertyData::Str(v) | PropertyData::OsdStr(v) => Prop::Str(v),
                    PropertyData::Flag(v) => Prop::Flag(v),
                    PropertyData::Int64(v) => Prop::Int(v),
                    PropertyData::Double(v) => Prop::Double(v),
                };
                let mut s = lock(snapshot);
                match s.apply(name, prop) {
                    Change::Position => {
                        if s.paused || last_position.elapsed() >= POSITION_INTERVAL {
                            last_position = Instant::now();
                            let position = s.position;
                            drop(s);
                            emit(app, POSITION_EVENT, position);
                        }
                    }
                    Change::State => {
                        let state = s.clone();
                        drop(s);
                        emit(app, STATE_EVENT, state);
                    }
                    Change::Ignored => {}
                }
            }
            Ok(_) => {}
            Err(e) => eprintln!("[player] event: {e}"),
        }
    }
}

fn emit<T: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(e) = app.emit(event, payload) {
        eprintln!("[player] emit {event}: {e}");
    }
}
