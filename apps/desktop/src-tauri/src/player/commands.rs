//! Tauri commands of the player; the renderer calls them only through src/shared/ipc/player.ts

use tauri::State;

use super::{Player, PlayerSnapshot, SeekMode};
use crate::error::AppResult;

#[tauri::command]
pub fn player_snapshot(player: State<'_, Player>) -> PlayerSnapshot {
    player.snapshot()
}

#[tauri::command]
pub fn player_open(player: State<'_, Player>, path: String) -> AppResult<()> {
    player.open(&path)
}

#[tauri::command]
pub fn player_stop(player: State<'_, Player>) -> AppResult<()> {
    player.stop()
}

#[tauri::command]
pub fn player_set_paused(player: State<'_, Player>, paused: bool) -> AppResult<()> {
    player.set_paused(paused)
}

#[tauri::command]
pub fn player_seek(player: State<'_, Player>, seconds: f64, mode: SeekMode) -> AppResult<()> {
    player.seek(seconds, mode)
}

#[tauri::command]
pub fn player_set_volume(player: State<'_, Player>, volume: f64) -> AppResult<()> {
    player.set_volume(volume)
}

#[tauri::command]
pub fn player_set_muted(player: State<'_, Player>, muted: bool) -> AppResult<()> {
    player.set_muted(muted)
}

#[tauri::command]
pub fn player_set_speed(player: State<'_, Player>, speed: f64) -> AppResult<()> {
    player.set_speed(speed)
}

#[tauri::command]
pub fn player_set_audio(player: State<'_, Player>, id: Option<i64>) -> AppResult<()> {
    player.set_audio(id)
}

#[tauri::command]
pub fn player_set_subtitle(player: State<'_, Player>, id: Option<i64>) -> AppResult<()> {
    player.set_subtitle(id)
}

#[tauri::command]
pub fn player_set_subtitles_visible(player: State<'_, Player>, visible: bool) -> AppResult<()> {
    player.set_subtitles_visible(visible)
}

#[tauri::command]
pub fn player_set_subtitle_margin(player: State<'_, Player>, margin: i64) -> AppResult<()> {
    player.set_subtitle_margin(margin)
}

/// The player screen shows the video window, other screens hide it.
/// `seq` orders the requests: IPC calls are not guaranteed to arrive in order
#[tauri::command]
pub fn player_set_video_visible(player: State<'_, Player>, visible: bool, seq: u64) {
    player.set_video_visible(visible, seq);
}
