import { i18n } from '../../../shared/i18n'
import { playerIpc, VOLUME_MAX, type Track } from '../../../shared/ipc/player'
import { trackTitle } from '../lib/trackLabel'
import { showOsd } from './osd'
import { playbackStore } from './playbackStore'

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
export const SEEK_STEP = 10
export const VOLUME_STEP = 5

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, { ns: 'player', ...options })

/** Every player command goes through here: buttons, hotkeys and the wheel behave the same */
function run(command: Promise<void>, what: string): void {
  command.catch((e: unknown) => console.error(`[player] ${what}`, e))
}

export function togglePause(): void {
  const { paused, eof, duration } = playbackStore.get()
  // At the end (keep-open) "play" starts over
  if (eof && paused && duration) run(playerIpc.seek(0, 'absolute'), 'seek')
  run(playerIpc.setPaused(!paused), 'pause')
}

/** What the first click of a possible double click found: the second one puts it back */
let pausedBeforeClick: boolean | null = null

/**
 * A click on the picture pauses or plays. The second click of a double click puts back what the
 * first one changed — from what it found, not from the state, which the core may not have reported
 * yet — so a double click leaves playback as it was (in the mini player it brings the window back)
 */
export function clickVideo(detail: number): void {
  if (detail === 1) {
    pausedBeforeClick = playbackStore.get().paused
    togglePause()
  } else if (detail === 2 && pausedBeforeClick != null) {
    run(playerIpc.setPaused(pausedBeforeClick), 'pause')
    pausedBeforeClick = null
  }
}

export function seekBy(seconds: number): void {
  run(playerIpc.seek(seconds, 'relative'), 'seek')
}

export function seekTo(seconds: number): void {
  run(playerIpc.seek(Math.max(0, seconds), 'absolute'), 'seek')
}

export function setVolume(volume: number, osd = false): void {
  const value = Math.round(Math.min(VOLUME_MAX, Math.max(0, volume)))
  run(playerIpc.setVolume(value), 'volume')
  if (playbackStore.get().muted && value > 0) run(playerIpc.setMuted(false), 'mute')
  if (osd) showOsd(t('osd.volume', { value }))
}

export function changeVolume(delta: number): void {
  setVolume(playbackStore.get().volume + delta, true)
}

export function toggleMute(): void {
  const muted = !playbackStore.get().muted
  run(playerIpc.setMuted(muted), 'mute')
  showOsd(muted ? t('osd.muted') : t('osd.volume', { value: Math.round(playbackStore.get().volume) }))
}

export function setSpeed(speed: number): void {
  run(playerIpc.setSpeed(speed), 'speed')
  showOsd(t('osd.speed', { value: speed }))
}

export function toggleSubtitles(): void {
  const visible = !playbackStore.get().subtitlesVisible
  run(playerIpc.setSubtitlesVisible(visible), 'subtitles')
  showOsd(visible ? t('osd.subtitlesOn') : t('osd.subtitlesOff'))
}

export function selectAudio(track: Track | null): void {
  run(playerIpc.setAudio(track?.id ?? null), 'audio')
  showOsd(t('osd.audio', { name: track ? trackTitle(track, i18n.language, t('tracks.unknown', { id: track.id })) : t('tracks.noAudio') }))
}

export function selectSubtitle(track: Track | null): void {
  run(playerIpc.setSubtitle(track?.id ?? null), 'subtitle')
  if (track && !playbackStore.get().subtitlesVisible) run(playerIpc.setSubtitlesVisible(true), 'subtitles')
  showOsd(t('osd.subtitle', { name: track ? trackTitle(track, i18n.language, t('tracks.unknown', { id: track.id })) : t('tracks.off') }))
}
