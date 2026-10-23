import type { ListItem } from '@kino/ui'
import { trackDetails, trackTitle } from '../../../entities/playback'
import type { Track, TrackKind } from '../../../shared/ipc/player'

/** Key of the "off" item: mpv track ids start at 1 */
export const OFF_KEY = 'off'

export interface TrackListLabels {
  off: string
  external: string
  unknown: (id: number) => string
}

/** Items of the audio or subtitle list; "off" goes first */
export function trackItems(tracks: Track[], kind: TrackKind, locale: string, labels: TrackListLabels): ListItem[] {
  const items: ListItem[] = tracks
    .filter((t) => t.kind === kind)
    .map((t) => ({
      id: String(t.id),
      label: trackTitle(t, locale, labels.unknown(t.id)),
      description: trackDetails(t) || undefined,
      badge: t.isExternal ? labels.external : undefined,
    }))
  return [{ id: OFF_KEY, label: labels.off }, ...items]
}

export function trackKey(id: number | null): string {
  return id == null ? OFF_KEY : String(id)
}

export function trackByKey(tracks: Track[], kind: TrackKind, key: string): Track | null {
  if (key === OFF_KEY) return null
  return tracks.find((t) => t.kind === kind && String(t.id) === key) ?? null
}
