import { describe, expect, it } from 'vitest'
import { codecLabel, qualityLine, resolutionLabel } from './quality'

describe('строка качества в плеере', () => {
  it('разрешение — по высоте и по ширине: широкоформатный фильм не теряет класс', () => {
    expect(resolutionLabel(3840, 2160)).toBe('2160p')
    expect(resolutionLabel(3840, 1600)).toBe('2160p')
    expect(resolutionLabel(1920, 800)).toBe('1080p')
    expect(resolutionLabel(1440, 1080)).toBe('1080p')
    expect(resolutionLabel(1280, 536)).toBe('720p')
    expect(resolutionLabel(720, 576)).toBe('576p')
    expect(resolutionLabel(null, null)).toBeNull()
  })

  it('кодек — привычным именем', () => {
    expect(codecLabel('hevc')).toBe('HEVC')
    expect(codecLabel('h264')).toBe('H.264')
    expect(codecLabel('prores')).toBe('PRORES')
  })

  it('качество, HDR, вес и средний битрейт; неизвестное пропускается', () => {
    const film = { videoWidth: 1920, videoHeight: 1080, videoCodec: 'hevc', hdr: true, fileSize: 1_610_612_736, duration: 2_700 }
    expect(qualityLine(film, 'ru')).toBe('1080p · HEVC · HDR · 1,5 ГБ · 4,8 Мбит/с')
    expect(qualityLine({ ...film, videoWidth: null, videoHeight: null, hdr: false, duration: null }, 'ru')).toBe('HEVC · 1,5 ГБ')
    expect(qualityLine({ ...film, fileSize: 300_000_000, duration: 3_600, hdr: false }, 'en')).toBe('1080p · HEVC · 286 MB · 667 kb/s')
  })
})
