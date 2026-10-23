import { useEffect } from 'react'
import { setFullscreen, toggleFullscreen, windowStore } from '../../../entities/app-window'
import {
  changeVolume,
  openNeighborEpisode,
  SEEK_STEP,
  seekBy,
  toggleMute,
  togglePause,
  toggleSubtitles,
  VOLUME_STEP,
} from '../../../entities/playback'
import { keymapOf, resolveHotkeys, settingsStore, type PlayerAction } from '../../../entities/settings'
import { resolvePlayerKey } from './playerKeymap'

const RUN: Record<PlayerAction, () => void> = {
  togglePause,
  seekBack: () => seekBy(-SEEK_STEP),
  seekForward: () => seekBy(SEEK_STEP),
  volumeUp: () => changeVolume(VOLUME_STEP),
  volumeDown: () => changeVolume(-VOLUME_STEP),
  toggleFullscreen,
  exitFullscreen: () => setFullscreen(false),
  toggleMute,
  toggleSubtitles,
  nextEpisode: () => void openNeighborEpisode(1),
  prevEpisode: () => void openNeighborEpisode(-1),
}

/** Toggles do not repeat while the key is held; seeking and volume do */
const REPEATABLE = new Set<PlayerAction>(['seekBack', 'seekForward', 'volumeUp', 'volumeDown'])

/**
 * Player keys on the whole window. Capture phase: Space pauses even when a control
 * button has focus after a click, instead of pressing that button again.
 */
export function usePlayerHotkeys(enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      // The keys of the settings at the moment of the press: a remap works at once
      const action = resolvePlayerKey(e, keymapOf(resolveHotkeys(settingsStore.get().hotkeys)))
      if (!action) return
      // Escape outside fullscreen is not ours
      if (action === 'exitFullscreen' && !windowStore.get().fullscreen) return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat && !REPEATABLE.has(action)) return
      RUN[action]()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [enabled])
}
