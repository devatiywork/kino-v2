import { invoke, listen, type UnlistenFn } from './bridge'

export type ThemeSetting = 'dark' | 'light' | 'system'
export type AccentSetting = 'ember' | 'gold' | 'lime' | 'teal' | 'violet'
export type LanguageSetting = 'ru' | 'en'
export type PreferredAudio = 'russian' | 'original'
/** Subtitles with a Russian dub: none, signs and inscriptions only, or the full ones */
export type RussianAudioSubtitles = 'off' | 'forced' | 'full'
export type SubtitleSize = 'small' | 'medium' | 'large'
export type SubtitlePosition = 'bottom' | 'raised' | 'high'

/** Mirrors src-tauri/src/settings/mod.rs */
export interface Settings {
  theme: ThemeSetting
  accent: AccentSetting
  language: LanguageSetting
  /** Continue a file from where it stopped */
  resume: boolean
  /** The next episode of the season starts by itself */
  autoplay: boolean
  defaultSpeed: number
  /** 0…100 */
  defaultVolume: number
  hardwareDecoding: boolean
  preferredAudio: PreferredAudio
  russianAudioSubtitles: RussianAudioSubtitles
  subtitleSize: SubtitleSize
  subtitlePosition: SubtitlePosition
  keepHistory: boolean
  /** 85 | 90 | 95 */
  watchedPercent: number
  /** Player action → KeyboardEvent.code, only the remapped ones */
  hotkeys: Record<string, string>
  /** No sleep while a video plays */
  keepAwake: boolean
  /** «Папка по умолчанию» of the downloads; empty — the system Downloads folder */
  downloadsFolder: string
  /** «Не начинать загрузку сразу» */
  startPaused: boolean
  /** «Не раздавать после загрузки — сразу в архив» */
  noSeeding: boolean
  /** KB/s; 0 — no limit */
  downloadLimit: number
  uploadLimit: number
  /** SPEC 4.6: closing the window while torrents work hides Kino in the tray */
  closeToTray: boolean
  notifyFinished: boolean
  /** The computer does not sleep while something downloads */
  keepAwakeDownloads: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: 'ember',
  language: 'ru',
  resume: true,
  autoplay: true,
  defaultSpeed: 1,
  defaultVolume: 100,
  hardwareDecoding: true,
  preferredAudio: 'russian',
  russianAudioSubtitles: 'forced',
  subtitleSize: 'medium',
  subtitlePosition: 'bottom',
  keepHistory: true,
  watchedPercent: 90,
  hotkeys: {},
  keepAwake: true,
  downloadsFolder: '',
  startPaused: false,
  noSeeding: false,
  downloadLimit: 0,
  uploadLimit: 0,
  closeToTray: true,
  notifyFinished: true,
  keepAwakeDownloads: true,
}

/** Typed wrappers over the settings commands; every change applies and is stored at once */
export const settingsIpc = {
  get: () => invoke<Settings>('settings_get'),
  /** Only the changed keys; the core refuses unknown keys and invalid values */
  update: (patch: Partial<Settings>) => invoke<Settings>('settings_update', { patch }),
  /** Everything back to the defaults; library folders and history stay */
  reset: () => invoke<Settings>('settings_reset'),
  /** Viewings, positions, frames and the track memory; library folders stay */
  clearHistory: () => invoke<void>('app_clear_history'),
  onChanged: (handler: (settings: Settings) => void): Promise<UnlistenFn> =>
    listen<Settings>('settings://changed', (e) => handler(e.payload)),
}
