import { describe, expect, it } from 'vitest'
import { formatRemaining, formatTime } from './formatTime'

describe('formatTime', () => {
  it('минуты и секунды, часы — только когда есть', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65.9)).toBe('1:05')
    expect(formatTime(23 * 60 + 14)).toBe('23:14')
    expect(formatTime(3723)).toBe('1:02:03')
  })

  it('с withHours ширина одинаковая у обоих времён длинного видео', () => {
    expect(formatTime(65, true)).toBe('0:01:05')
  })

  it('нет значения или мусор — нули', () => {
    expect(formatTime(null)).toBe('0:00')
    expect(formatTime(Number.NaN)).toBe('0:00')
    expect(formatTime(-3)).toBe('0:00')
  })
})

describe('formatRemaining', () => {
  it('сколько осталось, со знаком минус', () => {
    expect(formatRemaining(600, 3601)).toBe('−0:50:01')
    expect(formatRemaining(30, 90)).toBe('−1:00')
  })

  it('позиция за концом не даёт отрицательного', () => {
    expect(formatRemaining(100, 90)).toBe('−0:00')
  })

  it('без длительности — нули', () => {
    expect(formatRemaining(10, null)).toBe('0:00')
  })
})
