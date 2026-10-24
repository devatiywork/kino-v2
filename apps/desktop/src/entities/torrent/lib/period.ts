type T = (key: string, options?: Record<string, unknown>) => string

/** SPEC 4.4: the archive by when a torrent was added — a span back from today or a calendar year */
export type Period = 'all' | 'week' | 'month' | 'quarter' | 'year' | `y${number}`

const DAY = 86_400_000
const SPANS = { week: 7, month: 30, quarter: 91, year: 365 } as const

export function matchesPeriod(period: Period, addedAt: number, now = Date.now()): boolean {
  if (period === 'all') return true
  // «y2025» — a calendar year (not «year», the span)
  if (/^y\d+$/.test(period)) return new Date(addedAt).getFullYear() === Number(period.slice(1))
  return addedAt >= now - SPANS[period as keyof typeof SPANS] * DAY
}

/** The choices: the spans, then every year the archive has, newest first */
export function periodOptions(addedAt: readonly number[], t: T): { id: Period; label: string }[] {
  const years = [...new Set(addedAt.map((ms) => new Date(ms).getFullYear()))].sort((a, b) => b - a)
  return [
    { id: 'all', label: t('archive.period.all') },
    ...(['week', 'month', 'quarter', 'year'] as const).map((id) => ({ id, label: t(`archive.period.${id}`) })),
    ...years.map((year) => ({ id: `y${year}` as const, label: String(year) })),
  ]
}
