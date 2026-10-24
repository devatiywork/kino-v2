//! App settings (SPEC 6): one typed struct, stored as one JSON document in app_settings.
//! A stored value that no longer fits (an older version, a hand edit) falls back to its own
//! default — the other settings survive.

pub mod commands;

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::AppResult;
use crate::library::Library;

/// Row of app_settings that holds the settings
const STORAGE_KEY: &str = "settings";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    /// Follows the Windows setting
    System,
}

/// Accent presets: each has its own shade for the dark and the light theme (tokens.css)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Accent {
    Ember,
    Gold,
    Lime,
    Teal,
    Violet,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Ru,
    En,
}

/// Audio for a file nothing is remembered for
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PreferredAudio {
    Russian,
    Original,
}

/// Subtitles with a Russian dub: none, only signs and inscriptions, or the full ones
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RussianAudioSubtitles {
    Off,
    Forced,
    Full,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubtitleSize {
    Small,
    Medium,
    Large,
}

impl SubtitleSize {
    /// mpv sub-scale
    pub fn scale(self) -> f64 {
        match self {
            SubtitleSize::Small => 0.85,
            SubtitleSize::Medium => 1.0,
            SubtitleSize::Large => 1.2,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubtitlePosition {
    Bottom,
    Raised,
    High,
}

/// «Альтернативные лимиты» by the schedule: which days (SPEC 6)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleDays {
    Everyday,
    Weekdays,
    Weekends,
}

/// What BitTorrent connects over (SPEC 6 «Соединение»)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Protocol {
    TcpAndUtp,
    Tcp,
    Utp,
}

/// What happens to a torrent that has seeded enough by the settings' rules
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SeedLimitAction {
    /// It stays in the downloads, on pause
    Pause,
    /// It leaves the downloads for the archive, the files stay
    Archive,
}

impl SubtitlePosition {
    /// mpv sub-pos: 100 is the bottom edge of the video
    pub fn sub_pos(self) -> i64 {
        match self {
            SubtitlePosition::Bottom => 100,
            SubtitlePosition::Raised => 95,
            SubtitlePosition::High => 90,
        }
    }
}

/// The player's speeds (SPEC 3.1)
pub const SPEEDS: [f64; 6] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
/// «Считать просмотренной после»
pub const WATCHED_PERCENTS: [u8; 3] = [85, 90, 95];
/// More than the player has actions: a bound for a hand-edited database
const HOTKEYS_MAX: usize = 32;
/// 10 GB/s in KB/s: more is a typo
const LIMIT_MAX: u32 = 10_000_000;
const PEER_LIMIT_MAX: u32 = 2_000;
const QUEUE_MAX: u32 = 100;

/// «20:30» → minutes since midnight
pub fn minutes_of(time: &str) -> Option<u32> {
    let (hours, minutes) = time.trim().split_once(':')?;
    let (hours, minutes): (u32, u32) = (hours.parse().ok()?, minutes.parse().ok()?);
    (hours < 24 && minutes < 60).then_some(hours * 60 + minutes)
}

/// A web or UDP tracker address
pub fn is_tracker(url: &str) -> bool {
    ["http://", "https://", "udp://"].iter().any(|scheme| url.starts_with(scheme))
}

fn is_socks5(proxy: &str) -> bool {
    proxy
        .strip_prefix("socks5://")
        .and_then(|rest| rest.rsplit_once(':'))
        .is_some_and(|(host, port)| !host.is_empty() && port.parse::<u16>().is_ok_and(|p| p > 0))
}

impl Settings {
    /// The trackers added to every new torrent: the lines that are web or UDP addresses
    pub fn extra_tracker_list(&self) -> Vec<String> {
        self.extra_trackers.lines().map(str::trim).filter(|line| is_tracker(line)).map(str::to_string).collect()
    }

    /// This local time is inside the schedule of the alternative limits; None — no schedule
    /// (`weekday` 0 — Sunday, as Windows counts)
    pub fn in_schedule(&self, weekday: u32, minute: u32) -> Option<bool> {
        if !self.schedule_enabled {
            return None;
        }
        let day = match self.schedule_days {
            ScheduleDays::Everyday => true,
            ScheduleDays::Weekdays => (1..=5).contains(&weekday),
            ScheduleDays::Weekends => weekday == 0 || weekday == 6,
        };
        let (Some(from), Some(to)) = (minutes_of(&self.schedule_from), minutes_of(&self.schedule_to)) else { return Some(false) };
        let within = if from <= to { minute >= from && minute < to } else { minute >= from || minute < to };
        Some(day && within)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    // Appearance
    pub theme: Theme,
    pub accent: Accent,
    pub language: Language,
    // Playback
    /// Continue a file from where it stopped (SPEC 3.2)
    pub resume: bool,
    /// The next episode of the season starts by itself (SPEC 3.3)
    pub autoplay: bool,
    pub default_speed: f64,
    /// 0…100: what a run of Kino starts with
    pub default_volume: f64,
    pub hardware_decoding: bool,
    // Audio and subtitles
    pub preferred_audio: PreferredAudio,
    pub russian_audio_subtitles: RussianAudioSubtitles,
    pub subtitle_size: SubtitleSize,
    pub subtitle_position: SubtitlePosition,
    // Library and history
    /// Off — nothing new is remembered: no positions, viewings or frames
    pub keep_history: bool,
    pub watched_percent: u8,
    // Hotkeys: player action → KeyboardEvent.code, only the remapped ones
    pub hotkeys: BTreeMap<String, String>,
    // System
    /// No sleep and no screen saver while a video plays
    pub keep_awake: bool,
    /// «Медиаклавиши»: play / pause, next and previous keys of the keyboard and of Windows' media
    /// overlay, also when Kino is not in front
    pub media_keys: bool,
    // Downloads (torrents)
    /// «Папка по умолчанию»; empty — the system Downloads folder
    pub downloads_folder: String,
    /// «Окно добавления»: off — a .torrent or a magnet goes straight to the downloads (the last
    /// category, its folder); a torrent the archive knows still shows the window
    pub show_add_dialog: bool,
    /// «Удалять исходный .torrent после добавления» (the archive keeps its copy)
    pub delete_torrent_file: bool,
    /// «Отдельная папка для недокачанного»; empty — off. A finished torrent moves into its folder
    pub incomplete_folder: String,
    /// «Не начинать загрузку сразу»
    pub start_paused: bool,
    /// «Не раздавать после загрузки — сразу в архив» (SPEC 4.3)
    pub no_seeding: bool,
    /// KB/s; 0 — no limit
    pub download_limit: u32,
    pub upload_limit: u32,
    /// «Альтернативные лимиты» (KB/s, 0 — none): on by hand; the schedule turns them on and off
    /// at its edges
    pub alt_download_limit: u32,
    pub alt_upload_limit: u32,
    pub alt_limits_on: bool,
    pub schedule_enabled: bool,
    /// «HH:MM»; `to` before `from` — across midnight
    pub schedule_from: String,
    pub schedule_to: String,
    pub schedule_days: ScheduleDays,
    // Connection — read when the engine starts: they apply after a restart of Kino
    /// 0 — a random port at every start
    pub listen_port: u16,
    pub upnp: bool,
    pub protocol: Protocol,
    /// Connections per torrent; 0 — the engine's own (128)
    pub peer_limit: u32,
    /// «socks5://[user:password@]host:port»; empty — none
    pub proxy: String,
    pub dht: bool,
    pub lsd: bool,
    // BitTorrent
    /// Added to every new torrent, one per line
    pub extra_trackers: String,
    /// Seeding stops at this ratio (0 — no limit) or after these minutes of seeding (0 — none)
    pub seed_ratio_limit: f64,
    pub seed_time_limit: u32,
    pub seed_limit_action: SeedLimitAction,
    /// Downloading, seeding and all of them at once; the rest wait in the queue. 0 — no limit
    pub max_active_downloads: u32,
    pub max_active_seeds: u32,
    pub max_active_total: u32,
    /// «Медленные не считаются»: a torrent slower than 2 KB/s both ways for a minute takes no place
    pub queue_skip_slow: bool,
    /// «Тот же торрент ещё раз — объединить трекеры»: its new trackers join the archive's record
    pub merge_trackers: bool,
    /// SPEC 4.6: closing the window while torrents download or seed hides Kino in the tray
    pub close_to_tray: bool,
    /// A Windows notification when a torrent finishes
    pub notify_finished: bool,
    /// The computer does not sleep while something downloads (the screen may go off)
    pub keep_awake_downloads: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::Dark,
            accent: Accent::Ember,
            language: Language::Ru,
            resume: true,
            autoplay: true,
            default_speed: 1.0,
            default_volume: 100.0,
            hardware_decoding: true,
            preferred_audio: PreferredAudio::Russian,
            russian_audio_subtitles: RussianAudioSubtitles::Forced,
            subtitle_size: SubtitleSize::Medium,
            subtitle_position: SubtitlePosition::Bottom,
            keep_history: true,
            watched_percent: 90,
            hotkeys: BTreeMap::new(),
            keep_awake: true,
            media_keys: true,
            downloads_folder: String::new(),
            show_add_dialog: true,
            delete_torrent_file: false,
            incomplete_folder: String::new(),
            start_paused: false,
            no_seeding: false,
            download_limit: 0,
            upload_limit: 0,
            alt_download_limit: 1024,
            alt_upload_limit: 256,
            alt_limits_on: false,
            schedule_enabled: false,
            schedule_from: "08:00".into(),
            schedule_to: "20:00".into(),
            schedule_days: ScheduleDays::Everyday,
            listen_port: 0,
            upnp: true,
            protocol: Protocol::TcpAndUtp,
            peer_limit: 0,
            proxy: String::new(),
            dht: true,
            lsd: true,
            extra_trackers: String::new(),
            seed_ratio_limit: 0.0,
            seed_time_limit: 0,
            seed_limit_action: SeedLimitAction::Pause,
            max_active_downloads: 0,
            max_active_seeds: 0,
            max_active_total: 0,
            queue_skip_slow: false,
            merge_trackers: true,
            close_to_tray: true,
            notify_finished: true,
            keep_awake_downloads: true,
        }
    }
}

impl Settings {
    /// Values between the allowed ones snap to the nearest; broken hotkeys are dropped
    fn normalized(mut self) -> Self {
        let speed = self.default_speed;
        self.default_speed = SPEEDS.into_iter().min_by(|a, b| (a - speed).abs().total_cmp(&(b - speed).abs())).unwrap_or(1.0);
        self.default_volume = if self.default_volume.is_finite() { self.default_volume.clamp(0.0, 100.0).round() } else { 100.0 };
        if !WATCHED_PERCENTS.contains(&self.watched_percent) {
            self.watched_percent = Settings::default().watched_percent;
        }
        self.hotkeys.retain(|action, code| is_key_name(action) && is_key_name(code));
        while self.hotkeys.len() > HOTKEYS_MAX {
            self.hotkeys.pop_last();
        }
        self.downloads_folder = self.downloads_folder.trim().to_string();
        self.incomplete_folder = self.incomplete_folder.trim().to_string();
        self.download_limit = self.download_limit.min(LIMIT_MAX);
        self.upload_limit = self.upload_limit.min(LIMIT_MAX);
        self.alt_download_limit = self.alt_download_limit.min(LIMIT_MAX);
        self.alt_upload_limit = self.alt_upload_limit.min(LIMIT_MAX);
        let defaults = Settings::default();
        if minutes_of(&self.schedule_from).is_none() {
            self.schedule_from = defaults.schedule_from.clone();
        }
        if minutes_of(&self.schedule_to).is_none() {
            self.schedule_to = defaults.schedule_to;
        }
        self.peer_limit = self.peer_limit.min(PEER_LIMIT_MAX);
        // A broken proxy would keep the engine from starting: only socks5://host:port gets through
        self.proxy = self.proxy.trim().to_string();
        if !self.proxy.is_empty() && !is_socks5(&self.proxy) {
            self.proxy = String::new();
        }
        self.extra_trackers = self.extra_trackers.trim().to_string();
        self.seed_ratio_limit = if self.seed_ratio_limit.is_finite() { self.seed_ratio_limit.clamp(0.0, 1000.0) } else { 0.0 };
        self.max_active_downloads = self.max_active_downloads.min(QUEUE_MAX);
        self.max_active_seeds = self.max_active_seeds.min(QUEUE_MAX);
        self.max_active_total = self.max_active_total.min(QUEUE_MAX);
        self
    }

    /// Share of the duration after which a file counts as watched
    pub fn watched_ratio(&self) -> f64 {
        f64::from(self.watched_percent) / 100.0
    }

    /// mpv hwdec
    pub fn hwdec(&self) -> &'static str {
        if self.hardware_decoding {
            "auto-safe"
        } else {
            "no"
        }
    }
}

/// "togglePause", "KeyF", "ArrowLeft": an action or a KeyboardEvent.code
fn is_key_name(s: &str) -> bool {
    !s.is_empty() && s.len() <= 32 && s.chars().all(|ch| ch.is_ascii_alphanumeric())
}

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("unknown setting: {0}")]
    Unknown(String),
    #[error("invalid value of {key}: {message}")]
    Invalid { key: String, message: String },
}

fn to_map(settings: &Settings) -> Map<String, Value> {
    match serde_json::to_value(settings) {
        Ok(Value::Object(map)) => map,
        _ => unreachable!("Settings serializes to a JSON object"),
    }
}

/// `map` with `key` replaced, if the result is still valid settings
fn with_value(map: &Map<String, Value>, key: &str, value: &Value) -> Result<Map<String, Value>, serde_json::Error> {
    let mut candidate = map.clone();
    candidate.insert(key.to_string(), value.clone());
    serde_json::from_value::<Settings>(Value::Object(candidate.clone()))?;
    Ok(candidate)
}

/// Stored JSON → settings: unknown keys are dropped, a broken value falls back to its default
pub fn from_stored(json: &str) -> Settings {
    let stored = match serde_json::from_str::<Value>(json) {
        Ok(Value::Object(map)) => map,
        Ok(_) | Err(_) => {
            eprintln!("[settings] stored settings are not a JSON object, using the defaults");
            return Settings::default();
        }
    };
    let mut merged = to_map(&Settings::default());
    for (key, value) in &stored {
        if !merged.contains_key(key) {
            continue;
        }
        match with_value(&merged, key, value) {
            Ok(candidate) => merged = candidate,
            Err(e) => eprintln!("[settings] stored {key} ignored: {e}"),
        }
    }
    serde_json::from_value::<Settings>(Value::Object(merged)).unwrap_or_default().normalized()
}

/// A change from the renderer: only known keys, every value checked
pub fn merge(current: &Settings, patch: &Map<String, Value>) -> Result<Settings, SettingsError> {
    let mut merged = to_map(current);
    for (key, value) in patch {
        if !merged.contains_key(key) {
            return Err(SettingsError::Unknown(key.clone()));
        }
        merged = with_value(&merged, key, value).map_err(|e| SettingsError::Invalid { key: key.clone(), message: e.to_string() })?;
    }
    Ok(serde_json::from_value::<Settings>(Value::Object(merged)).unwrap_or_default().normalized())
}

/// The settings of this run; every change is stored at once
pub struct SettingsStore {
    library: Arc<Library>,
    current: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(library: Arc<Library>) -> Self {
        let current = match library.setting(STORAGE_KEY) {
            Ok(Some(json)) => from_stored(&json),
            Ok(None) => Settings::default(),
            Err(e) => {
                eprintln!("[settings] load: {e}");
                Settings::default()
            }
        };
        Self { library, current: Mutex::new(current) }
    }

    fn lock(&self) -> MutexGuard<'_, Settings> {
        self.current.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn get(&self) -> Settings {
        self.lock().clone()
    }

    /// One value without cloning the whole settings
    pub fn read<R>(&self, f: impl FnOnce(&Settings) -> R) -> R {
        f(&self.lock())
    }

    /// Applies a change and stores it; returns the settings before and after
    pub fn update(&self, patch: &Map<String, Value>) -> AppResult<(Settings, Settings)> {
        let mut current = self.lock();
        let next = merge(&current, patch)?;
        self.save(&next)?;
        Ok((std::mem::replace(&mut *current, next.clone()), next))
    }

    /// «Сбросить настройки»: everything back to the defaults
    pub fn reset(&self) -> AppResult<(Settings, Settings)> {
        let mut current = self.lock();
        let next = Settings::default();
        self.save(&next)?;
        Ok((std::mem::replace(&mut *current, next.clone()), next))
    }

    fn save(&self, settings: &Settings) -> AppResult<()> {
        Ok(self.library.set_setting(STORAGE_KEY, &serde_json::to_string(settings)?)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_schedule_of_the_alternative_limits() {
        let mut s = Settings { schedule_enabled: true, schedule_from: "08:00".into(), schedule_to: "20:00".into(), ..Settings::default() };
        assert_eq!(s.in_schedule(3, 8 * 60), Some(true));
        assert_eq!(s.in_schedule(3, 20 * 60), Some(false), "until 20:00, not including");
        s.schedule_days = ScheduleDays::Weekends;
        assert_eq!(s.in_schedule(3, 12 * 60), Some(false), "Wednesday");
        assert_eq!(s.in_schedule(0, 12 * 60), Some(true), "Sunday");
        // Across midnight: 23:00 — 07:00
        let night = Settings { schedule_enabled: true, schedule_from: "23:00".into(), schedule_to: "07:00".into(), ..Settings::default() };
        assert_eq!((night.in_schedule(2, 23 * 60 + 30), night.in_schedule(2, 6 * 60)), (Some(true), Some(true)));
        assert_eq!(night.in_schedule(2, 12 * 60), Some(false));
        assert_eq!(Settings::default().in_schedule(2, 12 * 60), None, "no schedule");
    }

    #[test]
    fn connection_values_that_could_break_the_engine_are_dropped() {
        let stored = r#"{"proxy":"http://nope","scheduleFrom":"25:00","peerLimit":99999,"seedRatioLimit":-3}"#;
        let s = from_stored(stored);
        assert_eq!((s.proxy.as_str(), s.schedule_from.as_str(), s.peer_limit, s.seed_ratio_limit), ("", "08:00", 2_000, 0.0));
        assert_eq!(from_stored(r#"{"proxy":"socks5://user:pw@10.0.0.1:1080"}"#).proxy, "socks5://user:pw@10.0.0.1:1080");
        let trackers = Settings { extra_trackers: "udp://t.example:80/announce\n# заметка\nhttps://t2.example/announce".into(), ..Settings::default() };
        assert_eq!(trackers.extra_tracker_list(), ["udp://t.example:80/announce", "https://t2.example/announce"]);
    }
    use serde_json::json;

    fn patch(value: Value) -> Map<String, Value> {
        match value {
            Value::Object(map) => map,
            _ => panic!("a patch is an object"),
        }
    }

    #[test]
    fn defaults_follow_the_spec() {
        let s = Settings::default();
        assert_eq!((s.theme, s.language, s.watched_percent), (Theme::Dark, Language::Ru, 90));
        assert!(s.resume && s.autoplay && s.keep_history && s.keep_awake && s.hardware_decoding);
        assert_eq!(s.watched_ratio(), 0.9);
    }

    #[test]
    fn serialized_names_are_the_renderer_ones() {
        let map = to_map(&Settings::default());
        assert_eq!(map["defaultSpeed"], json!(1.0));
        assert_eq!(map["russianAudioSubtitles"], json!("forced"));
        assert_eq!(map["hotkeys"], json!({}));
    }

    #[test]
    fn a_patch_changes_only_its_keys() {
        let next = merge(&Settings::default(), &patch(json!({ "theme": "light", "watchedPercent": 85 }))).unwrap();
        assert_eq!((next.theme, next.watched_percent), (Theme::Light, 85));
        assert_eq!(next.accent, Accent::Ember);
    }

    #[test]
    fn unknown_keys_and_bad_values_are_refused() {
        let current = Settings::default();
        assert!(matches!(merge(&current, &patch(json!({ "colour": "red" }))), Err(SettingsError::Unknown(k)) if k == "colour"));
        assert!(matches!(merge(&current, &patch(json!({ "theme": "pink" }))), Err(SettingsError::Invalid { key, .. }) if key == "theme"));
        assert!(merge(&current, &patch(json!({ "resume": "yes" }))).is_err());
    }

    #[test]
    fn values_snap_to_the_allowed_ones() {
        let next = merge(
            &Settings::default(),
            &patch(json!({ "defaultSpeed": 1.3, "defaultVolume": 250, "watchedPercent": 50, "hotkeys": { "togglePause": "KeyK", "bad key": "Space", "seekBack": "" } })),
        )
        .unwrap();
        assert_eq!(next.default_speed, 1.25);
        assert_eq!(next.default_volume, 100.0);
        assert_eq!(next.watched_percent, 90);
        assert_eq!(next.hotkeys, BTreeMap::from([("togglePause".to_string(), "KeyK".to_string())]));
    }

    #[test]
    fn a_broken_stored_value_falls_back_alone() {
        let s = from_stored(r#"{ "theme": "light", "accent": "neon", "autoplay": false, "removedLongAgo": 1 }"#);
        assert_eq!(s.theme, Theme::Light);
        assert_eq!(s.accent, Accent::Ember, "unknown accent → default");
        assert!(!s.autoplay);
        assert_eq!(from_stored("not json"), Settings::default());
    }

    #[test]
    fn store_keeps_changes_between_runs() {
        let library = Arc::new(Library::in_memory());
        let store = SettingsStore::load(library.clone());
        let (old, new) = store.update(&patch(json!({ "language": "en", "keepAwake": false }))).unwrap();
        assert_eq!((old.language, new.language), (Language::Ru, Language::En));

        let again = SettingsStore::load(library.clone());
        assert_eq!(again.get(), new);
        assert!(!again.read(|s| s.keep_awake));
        let (_, reset) = again.reset().unwrap();
        assert_eq!(reset, Settings::default());
        assert_eq!(SettingsStore::load(library).get(), Settings::default());
    }
}
