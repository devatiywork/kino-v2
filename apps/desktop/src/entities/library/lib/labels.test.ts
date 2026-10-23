import { describe, expect, it } from 'vitest'
import { i18n } from '../../../shared/i18n'
import { historyEntry, libraryFile } from '../../../test/library'
import { clockTime, durationText, episodeBadge, episodeLine, groupByDay, headline, progressRatio } from './labels'

const t = i18n.getFixedT('ru', 'library')

describe('library labels', () => {
  it('доля просмотра в пределах 0…1', () => {
    expect(progressRatio(1800, 3600)).toBe(0.5)
    expect(progressRatio(4000, 3600)).toBe(1)
    expect(progressRatio(10, null)).toBe(0)
  })

  it('серия: заголовок — сериал, строка — сезон и серия', () => {
    const file = libraryFile({ id: 5 })
    expect(headline(file)).toBe('The Sopranos')
    expect(episodeLine(file, t)).toBe('Сезон 1 · Серия 5')
    expect(episodeBadge(file, t)).toBe('С1 · Е5')
    expect(episodeLine({ ...file, season: null }, t)).toBe('Серия 5')
  })

  it('фильм: заголовок — название файла, серии нет', () => {
    const film = libraryFile({ id: 9, seriesTitle: null, season: null, episode: null, title: 'Interstellar 2014' })
    expect(headline(film)).toBe('Interstellar 2014')
    expect(episodeLine(film, t)).toBeNull()
    expect(episodeBadge(film, t)).toBeNull()
  })

  it('оставшееся время словами', () => {
    expect(durationText(20, t)).toBe('меньше минуты')
    expect(durationText(23 * 60, t)).toBe('23 мин')
    expect(durationText(65 * 60, t)).toBe('1 ч 5 мин')
  })

  it('история по дням: сегодня, вчера, дата; год — только для прошлых лет', () => {
    const now = new Date(2026, 9, 24, 21, 0)
    const file = libraryFile({ id: 1 })
    const groups = groupByDay(
      [
        historyEntry(4, new Date(2026, 9, 24, 20, 15), file),
        historyEntry(3, new Date(2026, 9, 24, 1, 5), file),
        historyEntry(2, new Date(2026, 9, 23, 23, 50), file),
        historyEntry(1, new Date(2026, 9, 20, 18, 0), file),
        historyEntry(0, new Date(2025, 11, 31, 22, 0), file),
      ],
      now,
      'ru',
      { today: 'Сегодня', yesterday: 'Вчера' },
    )
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Сегодня', 2],
      ['Вчера', 1],
      ['20 октября', 1],
      ['31 декабря 2025 г.', 1],
    ])
  })

  it('время просмотра — часы и минуты', () => {
    expect(clockTime(new Date(2026, 9, 24, 9, 5).getTime(), 'ru')).toBe('09:05')
  })
})
