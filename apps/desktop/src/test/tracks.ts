import type { Track } from '../shared/ipc/player'

/** A track as the core sends it; tests override what matters */
export function track(patch: Partial<Track> & Pick<Track, 'id' | 'kind'>): Track {
  return {
    title: null,
    lang: null,
    codec: null,
    channels: null,
    isDefault: false,
    isForced: false,
    isExternal: false,
    isSelected: false,
    ...patch,
  }
}

/** Tracks of "The Sopranos" S01E01 as mpv reported them in the spike */
export const SOPRANOS_TRACKS: Track[] = [
  track({ id: 1, kind: 'video', codec: 'h264', isDefault: true, isSelected: true }),
  track({ id: 1, kind: 'audio', title: 'DD 5.1 @ 640 kbps (AVO Goblin)', lang: 'rus', codec: 'ac3', channels: 6, isDefault: true, isSelected: true }),
  track({ id: 2, kind: 'audio', title: 'DD 5.1 @ 640 kbps (AVO Serbin)', lang: 'rus', codec: 'ac3', channels: 6 }),
  track({ id: 4, kind: 'audio', title: 'DD 5.1 @ 640 kbps (English)', lang: 'eng', codec: 'ac3', channels: 6 }),
  track({ id: 1, kind: 'sub', title: 'SRT (Novamedia)', lang: 'rus', codec: 'subrip' }),
  track({ id: 2, kind: 'sub', lang: 'eng', codec: 'ass', isExternal: true }),
]
