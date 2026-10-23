import { useEffect } from 'react'
import { playerIpc } from '../../../shared/ipc/player'

/** mpv's default sub-margin-y */
const BASE_MARGIN = 22
/** Height of the controls above the bottom edge, CSS px */
const CONTROLS_HEIGHT = 120

/** mpv margin (scaled to 720p) that keeps text subtitles above the controls */
export function subtitleMargin(controlsVisible: boolean, windowHeight: number): number {
  if (!controlsVisible || windowHeight <= 0) return BASE_MARGIN
  return BASE_MARGIN + Math.round((CONTROLS_HEIGHT / windowHeight) * 720)
}

/** mpv draws subtitles inside the video, under the page: lift them while the controls are shown */
export function useSubtitleLift(controlsVisible: boolean): void {
  useEffect(() => {
    const apply = () => {
      playerIpc
        .setSubtitleMargin(subtitleMargin(controlsVisible, window.innerHeight))
        .catch((e: unknown) => console.error('[player] subtitle margin', e))
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [controlsVisible])
}
