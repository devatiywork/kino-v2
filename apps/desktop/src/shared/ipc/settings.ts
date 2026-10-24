import { invoke, listen, type UnlistenFn } from './bridge'

export type ThemeSetting = 'dark' | 'light' | 'system'
export type AccentSetting = 'ember' | 'gold' | 'lime' | 'teal' | 'violet'
export type LanguageSetting = 'ru' | 'en'
export type PreferredAudio = 'russian' | 'original'
/** Subtitles with a Russian dub: none, signs and inscriptions only, or the full ones */
export type RussianAudioSubtitles = 'off' | 'forced' | 'full'
export type SubtitleSize = 'small' | 'medium' | 'large'
export type SubtitlePosition = 'bottom' | 'raised' | 'high'
/** The days of the alternative limits' schedule */
export type ScheduleDays = 'everyday' | 'weekdays' | 'weekends'
export type TorrentProtocol = 'tcpAndUtp' | 'tcp' | 'utp'
/** What a torrent that has seeded enough does: stays on pause or goes to the archive */
export type SeedLimitAction = 'pause' | 'archive'

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
  /** «Медиаклавиши»: also when Kino is not in front */
  mediaKeys: boolean
  /** «Проверять обновления»: GitHub Releases at start and once a day (SPEC 4.7: only when on) */
  checkUpdates: boolean
  /** «Блокировать рекламу» on the trackers' pages */
  blockAds: boolean
  /** «Папка по умолчанию» of the downloads; empty — the system Downloads folder */
  downloadsFolder: string
  /** «Не начинать загрузку сразу» */
  startPaused: boolean
  /** «Не раздавать после загрузки — сразу в архив» */
  noSeeding: boolean
  /** KB/s; 0 — no limit */
  downloadLimit: number
  uploadLimit: number
  /** «Альтернативные лимиты», KB/s: on by hand; the schedule turns them on and off at its edges */
  altDownloadLimit: number
  altUploadLimit: number
  altLimitsOn: boolean
  scheduleEnabled: boolean
  /** «HH:MM»; `to` before `from` — across midnight */
  scheduleFrom: string
  scheduleTo: string
  scheduleDays: ScheduleDays
  /** «Соединение»: read when the engine starts, so they apply after a restart. 0 — a random port */
  listenPort: number
  upnp: boolean
  protocol: TorrentProtocol
  /** Connections per torrent; 0 — the engine's own */
  peerLimit: number
  /** socks5://[user:password@]host:port; empty — none */
  proxy: string
  dht: boolean
  lsd: boolean
  /** Added to every new torrent, one per line */
  extraTrackers: string
  /** Seeding stops at this ratio (0 — no limit) or after these minutes (0 — none) */
  seedRatioLimit: number
  seedTimeLimit: number
  seedLimitAction: SeedLimitAction
  /** Downloading, seeding, all at once; the rest wait in the queue. 0 — no limit */
  maxActiveDownloads: number
  maxActiveSeeds: number
  maxActiveTotal: number
  /** «Медленные не считаются»: slower than 2 KB/s both ways for a minute — takes no place */
  queueSkipSlow: boolean
  /** «Тот же торрент ещё раз — объединить трекеры» */
  mergeTrackers: boolean
  /** «Окно добавления»: off — straight to the downloads, unless the archive knows the torrent */
  showAddDialog: boolean
  /** «Удалять исходный .torrent после добавления» */
  deleteTorrentFile: boolean
  /** «Отдельная папка для недокачанного»; empty — off */
  incompleteFolder: string
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
  mediaKeys: true,
  checkUpdates: false,
  blockAds: true,
  downloadsFolder: '',
  startPaused: false,
  noSeeding: false,
  downloadLimit: 0,
  uploadLimit: 0,
  altDownloadLimit: 1024,
  altUploadLimit: 256,
  altLimitsOn: false,
  scheduleEnabled: false,
  scheduleFrom: '08:00',
  scheduleTo: '20:00',
  scheduleDays: 'everyday',
  listenPort: 0,
  upnp: true,
  protocol: 'tcpAndUtp',
  peerLimit: 0,
  proxy: '',
  dht: true,
  lsd: true,
  extraTrackers: '',
  seedRatioLimit: 0,
  seedTimeLimit: 0,
  seedLimitAction: 'pause',
  maxActiveDownloads: 0,
  maxActiveSeeds: 0,
  maxActiveTotal: 0,
  queueSkipSlow: false,
  mergeTrackers: true,
  showAddDialog: true,
  deleteTorrentFile: false,
  incompleteFolder: '',
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
