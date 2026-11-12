import { invoke, listen, type UnlistenFn } from './bridge'

/** Mirrors src-tauri/src/player/tracks.rs */
export type TrackKind = 'video' | 'audio' | 'sub'

export interface Track {
  /** mpv id — valid only for the current file; (kind, id) identifies a track */
  id: number
  kind: TrackKind
  title: string | null
  lang: string | null
  codec: string | null
  channels: number | null
  isDefault: boolean
  isForced: boolean
  isExternal: boolean
  isSelected: boolean
  /** A Dolby Vision video track: its profile (5, 7, 8…) */
  dvProfile: number | null
}

/** Mirrors src-tauri/src/player/state.rs */
export interface PlayerSnapshot {
  path: string | null
  /** Readable file title */
  title: string | null
  /** From the file name: «The Sopranos», season 1, episode 5 */
  seriesKey: string | null
  seriesTitle: string | null
  season: number | null
  episode: number | null
  /** Neighbouring episodes on disk (N / P) */
  hasPrev: boolean
  hasNext: boolean
  duration: number | null
  position: number
  paused: boolean
  idle: boolean
  buffering: boolean
  eof: boolean
  volume: number
  muted: boolean
  speed: number
  audioId: number | null
  subtitleId: number | null
  subtitlesVisible: boolean
  tracks: Track[]
  hwdec: string | null
  /** The picture as decoded: 1920×1080 */
  videoWidth: number | null
  videoHeight: number | null
  /** mpv's codec name: «h264», «hevc», «av1» */
  videoCodec: string | null
  /** PQ or HLG: HDR10, Dolby Vision, HLG */
  hdr: boolean
  /** mpv's video-params/gamma: «pq», «hlg», «bt.1886»… */
  videoTransfer: string | null
  /** Bytes; with the duration — the average bitrate */
  fileSize: number | null
}

/** Mirrors src-tauri/src/player/stats.rs: what mpv does with the open file right now */
export interface PlayerStats {
  /** «d3d11va», «nvdec»…; «no» — the processor decodes */
  decoder: string | null
  codec: string | null
  /** «p010» (10 bit), «yuv420p» */
  pixelFormat: string | null
  width: number | null
  height: number | null
  fps: number | null
  primaries: string | null
  transfer: string | null
  matrix: string | null
  levels: string | null
  /** HDR metadata, nits */
  maxLuma: number | null
  maxCll: number | null
  maxFall: number | null
  /** What is rendered for the display */
  outPrimaries: string | null
  outTransfer: string | null
  outPeak: number | null
  vo: string | null
  gpuApi: string | null
  displayFps: number | null
  videoSync: string | null
  interpolation: boolean | null
  dropped: number | null
  decoderDropped: number | null
  delayed: number | null
  mistimed: number | null
  audioCodec: string | null
  audioChannels: number | null
  audioOutChannels: number | null
  /** «floatp», «s16»; «spdif-…» when the sound goes to the receiver undecoded */
  audioOutFormat: string | null
  audioOut: string | null
}

export type SeekMode = 'absolute' | 'relative'

export interface OpenResult {
  /** The file continues from here (SPEC 3.2) */
  resumedFrom: number | null
}

/** The next episode started by itself (src-tauri/src/player/events.rs Autoplay) */
export interface AutoplayEvent {
  resumedFrom: number | null
  season: number | null
  episode: number | null
}

/** Why the webcam is not there (src-tauri/src/presence/mod.rs Unavailable) */
export type CameraUnavailable = 'noCamera' | 'denied' | 'noDetector' | 'other'

/** Mirrors Notice in src-tauri/src/player/events.rs */
export type PlayerNotice =
  | { type: 'trackNotFound'; track: TrackKind; wanted: string; chosen: string | null }
  /** «Пауза, когда вы отходите»: nobody in front of the screen */
  | { type: 'awayPaused' }
  /** A face is back: the video goes on */
  | { type: 'awayResumed' }
  | { type: 'cameraUnavailable'; reason: CameraUnavailable }

/** «Проверить камеру» (src-tauri/src/presence/commands.rs) */
export type CameraCheck = { kind: 'seen'; camera: string; faces: number } | { kind: 'unavailable'; reason: CameraUnavailable }

export const VOLUME_MAX = 130

/** Show/hide requests are numbered: the core drops one that arrives after a newer one */
let videoSeq = 0

/** Typed wrappers over the player's Tauri commands and events */
/** Keys of the keyboard and of Windows' media overlay */
export type MediaKey = 'togglePause' | 'next' | 'previous' | 'stop'

export const playerIpc = {
  snapshot: () => invoke<PlayerSnapshot>('player_snapshot'),
  /** «Статистика воспроизведения» */
  stats: () => invoke<PlayerStats>('player_stats'),
  /** Continues from the saved position when there is one */
  open: (path: string) => invoke<OpenResult>('player_open', { path }),
  /** −1 previous, +1 next episode of the open one; null when there is none */
  openNeighbor: (step: -1 | 1) => invoke<OpenResult | null>('player_open_neighbor', { step }),
  stop: () => invoke<void>('player_stop'),
  setPaused: (paused: boolean) => invoke<void>('player_set_paused', { paused }),
  seek: (seconds: number, mode: SeekMode) => invoke<void>('player_seek', { seconds, mode }),
  setVolume: (volume: number) => invoke<void>('player_set_volume', { volume }),
  setMuted: (muted: boolean) => invoke<void>('player_set_muted', { muted }),
  setSpeed: (speed: number) => invoke<void>('player_set_speed', { speed }),
  setAudio: (id: number | null) => invoke<void>('player_set_audio', { id }),
  setSubtitle: (id: number | null) => invoke<void>('player_set_subtitle', { id }),
  setSubtitlesVisible: (visible: boolean) => invoke<void>('player_set_subtitles_visible', { visible }),
  setSubtitleMargin: (margin: number) => invoke<void>('player_set_subtitle_margin', { margin }),
  /** Share of the window width on the right that the video leaves free */
  setRightMargin: (ratio: number) => invoke<void>('player_set_right_margin', { ratio }),
  setVideoVisible: (visible: boolean) => invoke<void>('player_set_video_visible', { visible, seq: ++videoSeq }),
  /** «Мини-плеер»: the video into a small window of its own; the picture's size shapes it */
  enterMini: (width: number | null, height: number | null) => invoke<void>('player_enter_mini', { width, height }),
  /** The video back into the main window: onto its player screen (`expand`) or paused, out of sight */
  leaveMini: (expand: boolean) => invoke<void>('player_leave_mini', { expand }),
  /** The mini player is gone; `expand` — the main window shows the player again */
  onMiniClosed: (handler: (expand: boolean) => void): Promise<UnlistenFn> =>
    listen<{ expand: boolean }>('player://mini-closed', (e) => handler(e.payload.expand)),
  onState: (handler: (state: PlayerSnapshot) => void): Promise<UnlistenFn> =>
    listen<PlayerSnapshot>('player://state', (e) => handler(e.payload)),
  onPosition: (handler: (position: number) => void): Promise<UnlistenFn> =>
    listen<number>('player://position', (e) => handler(e.payload)),
  onNotice: (handler: (notice: PlayerNotice) => void): Promise<UnlistenFn> =>
    listen<PlayerNotice>('player://notice', (e) => handler(e.payload)),
  onAutoplay: (handler: (event: AutoplayEvent) => void): Promise<UnlistenFn> =>
    listen<AutoplayEvent>('player://autoplay', (e) => handler(e.payload)),
  /** «Проверить камеру»: opens the webcam for a few seconds and looks for a face */
  checkCamera: () => invoke<CameraCheck>('presence_check'),
  /** SPEC 6 «Медиаклавиши»: a key of Windows' media session (src-tauri/src/media_keys.rs) */
  onMediaKey: (handler: (key: MediaKey) => void): Promise<UnlistenFn> => listen<MediaKey>('media://key', (e) => handler(e.payload)),
}
