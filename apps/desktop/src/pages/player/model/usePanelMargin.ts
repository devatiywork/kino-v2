import { useEffect } from 'react'
import { playerIpc } from '../../../shared/ipc/player'

/** Width of the episode panel, CSS px (EpisodesPanel) */
export const PANEL_WIDTH = 360

/** While the episode panel is open the video and its subtitles move left of it */
export function usePanelMargin(open: boolean): void {
  useEffect(() => {
    const report = (e: unknown) => console.error('[player] right margin', e)
    const apply = () => playerIpc.setRightMargin(open ? PANEL_WIDTH / window.innerWidth : 0).catch(report)
    apply()
    window.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('resize', apply)
      if (open) playerIpc.setRightMargin(0).catch(report)
    }
  }, [open])
}
