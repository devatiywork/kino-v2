import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

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
  title: string | null
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
}

export type SeekMode = 'absolute' | 'relative'

export const VOLUME_MAX = 130

/** Show/hide requests are numbered: the core drops one that arrives after a newer one */
let videoSeq = 0

/** Typed wrappers over the player's Tauri commands and events */
export const playerIpc = {
  snapshot: () => invoke<PlayerSnapshot>('player_snapshot'),
  open: (path: string) => invoke<void>('player_open', { path }),
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
  setVideoVisible: (visible: boolean) => invoke<void>('player_set_video_visible', { visible, seq: ++videoSeq }),
  onState: (handler: (state: PlayerSnapshot) => void): Promise<UnlistenFn> =>
    listen<PlayerSnapshot>('player://state', (e) => handler(e.payload)),
  onPosition: (handler: (position: number) => void): Promise<UnlistenFn> =>
    listen<number>('player://position', (e) => handler(e.payload)),
}
