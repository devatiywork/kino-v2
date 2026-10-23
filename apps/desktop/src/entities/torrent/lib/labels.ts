import type { ActiveTorrent, Category } from '../../../shared/ipc/torrents'
import { formatDecimal } from '../../../shared/lib/formatBytes'
import { formatDuration } from '../../../shared/lib/formatDuration'

type T = (key: string, options?: Record<string, unknown>) => string

export function categoryName(id: number | null, categories: readonly Category[], t: T): string {
  return categories.find((c) => c.id === id)?.name ?? t('noCategory')
}

/** «62% · ещё 12 мин», «рейтинг 2,31», «34%» */
export function progressText(torrent: ActiveTorrent, t: T, locale: string): string {
  if (torrent.state === 'seeding') return t('ratio', { value: formatDecimal(torrent.ratio, locale) })
  const percent = `${Math.floor(torrent.progress * 100)}%`
  if (torrent.state === 'downloading' && torrent.eta != null) return `${percent} · ${t('left', { time: formatDuration(torrent.eta, locale) })}`
  return percent
}

/** «1 окт. 2026» */
export function shortDate(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(ms).replace(' г.', '')
}

/** «Октябрь 2026» — the archive's groups */
export function monthTitle(ms: number, locale: string): string {
  const text = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(ms).replace(' г.', '')
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch (e: unknown) {
    console.warn('[torrents] not a link', url, e)
    return url
  }
}
