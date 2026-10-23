import { describe, expect, it } from 'vitest'
import { formatDecimal, formatRate, formatSize } from './formatBytes'
import { formatDuration } from './formatDuration'

const nbsp = (s: string) => s.replace(/ | /g, ' ')

describe('размеры, скорости и время', () => {
  it('размер — в единицах языка интерфейса', () => {
    expect(nbsp(formatSize(41.2 * 1024 ** 3, 'ru'))).toBe('41,2 ГБ')
    expect(nbsp(formatSize(612 * 1024 ** 2, 'ru'))).toBe('612 МБ')
    expect(nbsp(formatSize(41.2 * 1024 ** 3, 'en'))).toBe('41.2 GB')
    expect(nbsp(formatSize(100, 'en'))).toBe('1 kB')
    expect(nbsp(formatSize(0, 'en'))).toBe('0 kB')
  })

  it('скорость и рейтинг', () => {
    expect(nbsp(formatRate(18.2 * 1024 ** 2, 'ru'))).toBe('18,2 МБ/с')
    expect(nbsp(formatRate(640 * 1024, 'en'))).toBe('640 kB/s')
    expect(formatDecimal(2.314, 'ru')).toBe('2,31')
  })

  it('сколько осталось', () => {
    expect(nbsp(formatDuration(2 * 3600 + 5 * 60, 'ru'))).toBe('2 ч 5 мин')
    expect(nbsp(formatDuration(12 * 60 + 3, 'ru'))).toBe('12 мин')
    expect(nbsp(formatDuration(40, 'en'))).toBe('40 sec')
  })
})
