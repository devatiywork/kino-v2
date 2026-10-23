import type { TFunction } from 'i18next'
import type { HistoryEntry, LibraryFile } from '../../../shared/ipc/library'

/** Share of the file watched, 0…1 */
export function progressRatio(position: number, duration: number | null): number {
  if (!duration || duration <= 0) return 0
  return Math.min(1, Math.max(0, position / duration))
}

/** Main title: the series for an episode, the file title otherwise */
export function headline(file: LibraryFile): string {
  return file.seriesTitle ?? file.title
}

/** "Сезон 1 · Серия 5", "Серия 5" or null for a film */
export function episodeLine(file: LibraryFile, t: TFunction<'library'>): string | null {
  if (file.episode == null) return null
  return file.season != null ? t('seasonEpisode', { season: file.season, episode: file.episode }) : t('episodeOnly', { episode: file.episode })
}

/** Short mark on a card: "С1 · Е5" */
export function episodeBadge(file: LibraryFile, t: TFunction<'library'>): string | null {
  if (file.episode == null) return null
  return file.season != null ? t('badge', { season: file.season, episode: file.episode }) : t('badgeEpisode', { episode: file.episode })
}

/** "23 мин", "1 ч 5 мин", "меньше минуты" */
export function durationText(seconds: number, t: TFunction<'library'>): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return t('lessThanMinute')
  if (minutes < 60) return t('minutes', { m: minutes })
  return t('hoursMinutes', { h: Math.floor(minutes / 60), m: minutes % 60 })
}

export interface DayGroup {
  key: string
  label: string
  items: HistoryEntry[]
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** History by day: "Сегодня", "Вчера", "21 октября" (with the year if not this one) */
export function groupByDay(entries: HistoryEntry[], now: Date, locale: string, labels: { today: string; yesterday: string }): DayGroup[] {
  const today = dayKey(now)
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const groups: DayGroup[] = []
  for (const entry of entries) {
    const date = new Date(entry.endedAt)
    const key = dayKey(date)
    let group = groups.find((g) => g.key === key)
    if (!group) {
      const label =
        key === today
          ? labels.today
          : key === yesterday
            ? labels.yesterday
            : new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'long',
                ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
              }).format(date)
      group = { key, label, items: [] }
      groups.push(group)
    }
    group.items.push(entry)
  }
  return groups
}

/** "21:05" */
export function clockTime(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
}
