//! Tauri commands of the player; the renderer calls them only through src/shared/ipc/player.ts

use tauri::State;

use super::{OpenResult, Player, PlayerSnapshot, SeekMode};
use crate::error::AppResult;

#[tauri::command]
pub fn player_snapshot(player: State<'_, Player>) -> PlayerSnapshot {
    player.snapshot()
}

/// Opens a file, continuing from the saved position when there is one
#[tauri::command]
pub fn player_open(player: State<'_, Player>, path: String) -> AppResult<OpenResult> {
    player.open(&path)
}

/// Previous (−1) or next (+1) episode of the open one; None — there is none
#[tauri::command]
pub fn player_open_neighbor(player: State<'_, Player>, step: i32) -> AppResult<Option<OpenResult>> {
    player.open_neighbor(step)
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

/// The episode panel covers the right side: the video and its subtitles move left of it
#[tauri::command]
pub fn player_set_right_margin(player: State<'_, Player>, ratio: f64) -> AppResult<()> {
    player.set_right_margin(ratio)
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
