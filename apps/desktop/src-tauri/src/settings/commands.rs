//! Tauri commands of the settings; the renderer calls them through src/shared/ipc/settings.ts

use std::sync::Arc;

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use super::{Settings, SettingsStore};
use crate::error::AppResult;
use crate::library::{Library, Policy};
use crate::media_keys::MediaSession;
use crate::player::Player;
use crate::torrent::Torrents;

/// The settings changed (from any window or command): the full settings
pub const CHANGED_EVENT: &str = "settings://changed";

/// What the library takes from the settings
pub fn library_policy(settings: &Settings) -> Policy {
    Policy { keep_history: settings.keep_history, watched_ratio: settings.watched_ratio() }
}

#[tauri::command]
pub fn settings_get(settings: State<'_, Arc<SettingsStore>>) -> Settings {
    settings.get()
}

/// Changes some settings: `{ "theme": "light" }`. Unknown keys and invalid values are refused
#[tauri::command]
pub fn settings_update(
    app: AppHandle,
    settings: State<'_, Arc<SettingsStore>>,
    library: State<'_, Arc<Library>>,
    player: State<'_, Player>,
    torrents: State<'_, Arc<Torrents>>,
    patch: Map<String, Value>,
) -> AppResult<Settings> {
    let (old, new) = settings.update(&patch)?;
    apply(&app, &library, &player, &torrents, &old, &new);
    Ok(new)
}

/// «Сбросить настройки»: everything to the defaults; library folders and history stay
#[tauri::command]
pub fn settings_reset(
    app: AppHandle,
    settings: State<'_, Arc<SettingsStore>>,
    library: State<'_, Arc<Library>>,
    player: State<'_, Player>,
    torrents: State<'_, Arc<Torrents>>,
) -> AppResult<Settings> {
    let (old, new) = settings.reset()?;
    apply(&app, &library, &player, &torrents, &old, &new);
    Ok(new)
}

/// SPEC 6: changes apply at once, without a «Save» button
fn apply(app: &AppHandle, library: &Library, player: &Player, torrents: &Torrents, old: &Settings, new: &Settings) {
    library.set_policy(library_policy(new));
    player.apply_settings(old, new);
    // The limits, the alternative ones, the schedule: the engine gets what holds now
    torrents.refresh_limits();
    if let Some(media) = app.try_state::<Arc<MediaSession>>() {
        media.set_enabled(new.media_keys);
    }
    if let Err(e) = app.emit(CHANGED_EVENT, new) {
        eprintln!("[settings] emit: {e}");
    }
}
