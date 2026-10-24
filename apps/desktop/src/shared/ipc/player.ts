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
  /** Bytes; with the duration — the average bitrate */
  fileSize: number | null
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

/** Mirrors Notice in src-tauri/src/player/events.rs */
export type PlayerNotice = { type: 'trackNotFound'; track: TrackKind; wanted: string; chosen: string | null }

export const VOLUME_MAX = 130

/** Show/hide requests are numbered: the core drops one that arrives after a newer one */
let videoSeq = 0

/** Typed wrappers over the player's Tauri commands and events */
/** Keys of the keyboard and of Windows' media overlay */
export type MediaKey = 'togglePause' | 'next' | 'previous' | 'stop'

export const playerIpc = {
  snapshot: () => invoke<PlayerSnapshot>('player_snapshot'),
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
  /** SPEC 6 «Медиаклавиши»: a key of Windows' media session (src-tauri/src/media_keys.rs) */
  onMediaKey: (handler: (key: MediaKey) => void): Promise<UnlistenFn> => listen<MediaKey>('media://key', (e) => handler(e.payload)),
}
