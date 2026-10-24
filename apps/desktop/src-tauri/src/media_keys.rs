//! SPEC 6 «Медиаклавиши»: Kino is a media session of Windows (System Media Transport Controls).
//! Play / pause, next and previous keys reach it even when another window has the focus, and
//! the Windows media overlay shows the episode. The keys go to the renderer as `media://key`,
//! which handles them like the player's own hotkeys. Knows the player only by its state event.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Listener};
use windows::core::HSTRING;
use windows::Foundation::TypedEventHandler;
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls, SystemMediaTransportControlsButton,
    SystemMediaTransportControlsButtonPressedEventArgs,
};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

use crate::player::STATE_EVENT;

pub const KEY_EVENT: &str = "media://key";

/// A key of the media session
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaKey {
    TogglePause,
    Next,
    Previous,
    Stop,
}

/// What the media session shows: the part of the player's state it needs
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Shown {
    pub title: Option<String>,
    pub series_title: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub paused: bool,
    pub idle: bool,
    pub has_prev: bool,
    pub has_next: bool,
}

impl Shown {
    /// «Сёгун» and «Сезон 1, серия 5 · Shogun.S01E05» — or the file's title alone
    pub fn lines(&self) -> (String, String) {
        let title = self.title.clone().unwrap_or_default();
        match (&self.series_title, self.season, self.episode) {
            (Some(series), Some(season), Some(episode)) => (series.clone(), format!("S{season:02}E{episode:02} · {title}")),
            (Some(series), None, Some(episode)) => (series.clone(), format!("E{episode:02} · {title}")),
            _ => (title, String::new()),
        }
    }
}

fn key_of(button: SystemMediaTransportControlsButton) -> Option<MediaKey> {
    match button {
        SystemMediaTransportControlsButton::Play | SystemMediaTransportControlsButton::Pause => Some(MediaKey::TogglePause),
        SystemMediaTransportControlsButton::Next => Some(MediaKey::Next),
        SystemMediaTransportControlsButton::Previous => Some(MediaKey::Previous),
        SystemMediaTransportControlsButton::Stop => Some(MediaKey::Stop),
        _ => None,
    }
}

#[derive(Default)]
struct SessionState {
    /// The player's last state
    shown: Shown,
    /// «Медиаклавиши» of the settings
    enabled: bool,
    /// What the session shows now; None — it is off
    applied: Option<Shown>,
}

pub struct MediaSession {
    controls: SystemMediaTransportControls,
    state: Mutex<SessionState>,
}

impl MediaSession {
    /// The window's media session; its keys go to the renderer
    pub fn attach(app: &AppHandle, hwnd: isize, enabled: bool) -> windows::core::Result<Self> {
        let interop = windows::core::factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()?;
        // SAFETY: the main window's handle, alive as long as the app
        let controls: SystemMediaTransportControls = unsafe { interop.GetForWindow(HWND(hwnd as _))? };
        controls.SetIsPlayEnabled(true)?;
        controls.SetIsPauseEnabled(true)?;
        controls.SetIsStopEnabled(true)?;
        controls.SetIsEnabled(false)?;
        let app = app.clone();
        controls.ButtonPressed(&TypedEventHandler::<SystemMediaTransportControls, SystemMediaTransportControlsButtonPressedEventArgs>::new(
            move |_, args| {
                if let Some(key) = args.as_ref().and_then(|args| args.Button().ok()).and_then(key_of) {
                    if let Err(e) = app.emit(KEY_EVENT, key) {
                        eprintln!("[media] emit: {e}");
                    }
                }
                Ok(())
            },
        ))?;
        Ok(Self { controls, state: Mutex::new(SessionState { enabled, ..SessionState::default() }) })
    }

    fn state(&self) -> std::sync::MutexGuard<'_, SessionState> {
        self.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// The player's state: the episode's lines, playing or paused
    pub fn show(&self, shown: Shown) {
        let mut state = self.state();
        state.shown = shown;
        self.apply(&mut state);
    }

    /// «Медиаклавиши» switched in the settings
    pub fn set_enabled(&self, enabled: bool) {
        let mut state = self.state();
        state.enabled = enabled;
        self.apply(&mut state);
    }

    /// On while something is open and the setting allows
    fn apply(&self, state: &mut SessionState) {
        let wanted = (state.enabled && !state.shown.idle).then(|| state.shown.clone());
        if wanted == state.applied {
            return;
        }
        let result = match &wanted {
            None => self.controls.SetIsEnabled(false),
            Some(shown) => self.update(shown, state.applied.as_ref()),
        };
        match result {
            Ok(()) => state.applied = wanted,
            Err(e) => eprintln!("[media] {e}"),
        }
    }

    fn update(&self, shown: &Shown, was: Option<&Shown>) -> windows::core::Result<()> {
        self.controls.SetIsEnabled(true)?;
        self.controls.SetIsNextEnabled(shown.has_next)?;
        self.controls.SetIsPreviousEnabled(shown.has_prev)?;
        self.controls.SetPlaybackStatus(if shown.paused { MediaPlaybackStatus::Paused } else { MediaPlaybackStatus::Playing })?;
        if was.is_none_or(|was| was.lines() != shown.lines()) {
            let (title, subtitle) = shown.lines();
            let updater = self.controls.DisplayUpdater()?;
            updater.SetType(MediaPlaybackType::Video)?;
            let video = updater.VideoProperties()?;
            video.SetTitle(&HSTRING::from(title))?;
            video.SetSubtitle(&HSTRING::from(subtitle))?;
            updater.Update()?;
        }
        Ok(())
    }
}

/// The media session follows the player's state
pub fn follow_player(app: &AppHandle, session: std::sync::Arc<MediaSession>) {
    app.listen_any(STATE_EVENT, move |event| match serde_json::from_str::<Shown>(event.payload()) {
        Ok(shown) => session.show(shown),
        Err(e) => eprintln!("[media] state: {e}"),
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_overlay_names_the_series_and_the_episode() {
        let episode = Shown {
            title: Some("Shogun.S01E05.2160p".into()),
            series_title: Some("Сёгун".into()),
            season: Some(1),
            episode: Some(5),
            ..Shown::default()
        };
        assert_eq!(episode.lines(), ("Сёгун".into(), "S01E05 · Shogun.S01E05.2160p".into()));
        let film = Shown { title: Some("Film.2014".into()), ..Shown::default() };
        assert_eq!(film.lines(), ("Film.2014".into(), String::new()));
    }

    #[test]
    fn the_player_state_is_read_as_much_as_needed() {
        let state = r#"{"path":"D:\\a.mkv","title":"A","paused":true,"idle":false,"hasNext":true,"volume":50,"tracks":[]}"#;
        let shown: Shown = serde_json::from_str(state).unwrap();
        assert_eq!((shown.title.as_deref(), shown.paused, shown.has_next, shown.has_prev), (Some("A"), true, true, false));
    }

    #[test]
    fn the_session_keys() {
        assert_eq!(key_of(SystemMediaTransportControlsButton::Pause), Some(MediaKey::TogglePause));
        assert_eq!(key_of(SystemMediaTransportControlsButton::Next), Some(MediaKey::Next));
        assert_eq!(key_of(SystemMediaTransportControlsButton::Rewind), None);
    }
}
