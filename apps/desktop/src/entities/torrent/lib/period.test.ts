import { describe, expect, it } from 'vitest'
import { matchesPeriod, periodOptions } from './period'

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 24, 12)
const t = (key: string) => key

describe('period', () => {
  it('промежутки назад от сегодня и календарный год', () => {
    expect(matchesPeriod('all', 0, now)).toBe(true)
    expect(matchesPeriod('week', now - 6 * DAY, now)).toBe(true)
    expect(matchesPeriod('week', now - 8 * DAY, now)).toBe(false)
    expect(matchesPeriod('month', now - 29 * DAY, now)).toBe(true)
    expect(matchesPeriod('quarter', now - 100 * DAY, now)).toBe(false)
    expect(matchesPeriod('year', now - 300 * DAY, now)).toBe(true)
    expect(matchesPeriod('y2025', Date.UTC(2025, 5, 1), now)).toBe(true)
    expect(matchesPeriod('y2025', Date.UTC(2026, 0, 2), now)).toBe(false)
  })

  it('варианты: промежутки, затем годы архива, новые первыми', () => {
    const options = periodOptions([Date.UTC(2024, 3, 1), Date.UTC(2026, 1, 1), Date.UTC(2024, 7, 1)], t)
    expect(options.map((o) => o.id)).toEqual(['all', 'week', 'month', 'quarter', 'year', 'y2026', 'y2024'])
    expect(options.at(-1)?.label).toBe('2024')
  })
})
