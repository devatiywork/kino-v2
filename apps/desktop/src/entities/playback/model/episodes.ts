import { i18n } from '../../../shared/i18n'
import { playerIpc, type AutoplayEvent } from '../../../shared/ipc/player'
import { showOsd } from './osd'
import { setResumed } from './resume'

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, { ns: 'player', ...options })

function episodeLabel(season: number | null, episode: number | null): string | null {
  if (episode == null) return null
  return season != null ? t('osd.seasonEpisode', { season, episode }) : t('osd.episode', { episode })
}

/** N / P and the buttons: the next or previous episode, across seasons (SPEC 3.1) */
export async function openNeighborEpisode(step: -1 | 1): Promise<void> {
  try {
    const opened = await playerIpc.openNeighbor(step)
    if (!opened) {
      showOsd(step > 0 ? t('osd.noNext') : t('osd.noPrev'))
      return
    }
    setResumed(opened.resumedFrom)
  } catch (e: unknown) {
    console.error('[player] neighbour episode', e)
  }
}

/** The core started the next episode by itself: where it continues from, which one it is */
export function onAutoplayed(event: AutoplayEvent): void {
  setResumed(event.resumedFrom)
  const label = episodeLabel(event.season, event.episode)
  if (label) showOsd(label)
}
