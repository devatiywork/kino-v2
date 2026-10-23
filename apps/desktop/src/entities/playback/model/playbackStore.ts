import { playerIpc, type PlayerSnapshot } from '../../../shared/ipc/player'
import { createStore, useStore } from '../../../shared/lib/createStore'

export const initialPlayback: PlayerSnapshot = {
  path: null,
  title: null,
  duration: null,
  position: 0,
  paused: false,
  idle: true,
  buffering: false,
  eof: false,
  volume: 100,
  muted: false,
  speed: 1,
  audioId: null,
  subtitleId: null,
  subtitlesVisible: true,
  tracks: [],
  hwdec: null,
}

/** Player state mirrored from the Rust core; position arrives separately and more often */
export const playbackStore = createStore<PlayerSnapshot>(initialPlayback)

export function usePlayback<R>(selector: (state: PlayerSnapshot) => R): R {
  return useStore(playbackStore, selector)
}

/** Subscribe to the core's events and fetch the current state. Returns the unsubscribe */
export function startPlaybackSync(): () => void {
  let disposed = false
  const unlisteners = [
    playerIpc.onState((state) => playbackStore.set(state)),
    playerIpc.onPosition((position) => playbackStore.set({ position })),
  ]
  playerIpc
    .snapshot()
    .then((state) => {
      if (!disposed) playbackStore.set(state)
    })
    .catch((e: unknown) => console.error('[playback] snapshot', e))
  return () => {
    disposed = true
    for (const p of unlisteners) p.then((unlisten) => unlisten()).catch((e: unknown) => console.error('[playback] unlisten', e))
  }
}
