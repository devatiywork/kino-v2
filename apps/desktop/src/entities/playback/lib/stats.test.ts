import i18next from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PlayerStats } from '../../../shared/ipc/player'
import { statsRows } from './stats'

const empty: PlayerStats = {
  decoder: null,
  codec: null,
  pixelFormat: null,
  width: null,
  height: null,
  fps: null,
  primaries: null,
  transfer: null,
  matrix: null,
  levels: null,
  maxLuma: null,
  maxCll: null,
  maxFall: null,
  outPrimaries: null,
  outTransfer: null,
  outPeak: null,
  vo: null,
  gpuApi: null,
  displayFps: null,
  videoSync: null,
  interpolation: null,
  dropped: null,
  decoderDropped: null,
  delayed: null,
  mistimed: null,
  audioCodec: null,
  audioChannels: null,
  audioOutChannels: null,
  audioOutFormat: null,
  audioOut: null,
}

/** What mpv reported for the HDR10 test clip on the owner's RTX 5070 Ti with Windows' HDR off */
const hdr10: PlayerStats = {
  ...empty,
  decoder: 'd3d11va',
  codec: 'hevc',
  pixelFormat: 'p010',
  width: 3840,
  height: 2160,
  fps: 23.976,
  primaries: 'bt.2020',
  transfer: 'pq',
  matrix: 'bt.2020-ncl',
  levels: 'limited',
  maxLuma: 1000,
  maxCll: 1000,
  maxFall: 400,
  outPrimaries: 'bt.709',
  outTransfer: 'gamma2.2',
  outPeak: 203,
  vo: 'gpu-next',
  gpuApi: 'd3d11',
  displayFps: 239.97,
  videoSync: 'audio',
  interpolation: false,
  dropped: 0,
  decoderDropped: 0,
  delayed: 0,
  mistimed: 0,
  audioCodec: 'ac3',
  audioChannels: 6,
  audioOutChannels: 2,
  audioOutFormat: 'floatp',
  audioOut: 'wasapi',
}

const t = (key: string, options?: Record<string, unknown>) => i18next.t(key, { ns: 'player', ...options })

describe('statsRows', () => {
  beforeAll(async () => {
    await i18next.changeLanguage('ru')
  })

  it('декодер, кадр, цвет, HDR-метаданные, вывод, экран, кадры, звук — как их видно на вкладке', () => {
    const rows = Object.fromEntries(statsRows(hdr10, null, t, 'ru').map((r) => [r.label, r.value]))
    expect(rows['Декодер']).toBe('d3d11va — аппаратный')
    expect(rows['Видео']).toBe('HEVC · 3840×2160 · p010 · 23,976 к/с')
    expect(rows['Цвет']).toBe('BT.2020 · PQ (ST 2084) · BT.2020 NCL · ограниченный диапазон')
    expect(rows['HDR']).toBe('мастеринг 1000 нит · MaxCLL 1000 · MaxFALL 400')
    // Windows' HDR off: the HDR film is tone mapped to SDR, and the panel says so
    expect(rows['Вывод']).toBe('SDR · BT.709 · гамма 2.2 · 203 нит')
    expect(rows['Экран']).toBe('239,97 Гц · кадры по звуку')
    expect(rows['Кадры']).toBe('пропущено 0 · декодером 0 · с задержкой 0 · не в такт 0')
    expect(rows['Звук']).toBe('AC3 · 6 кан. → 2 · wasapi')
    expect(rows['Dolby Vision']).toBeUndefined()
  })

  it('HDR на выходе, Dolby Vision, звук на ресивер; программное декодирование; неизвестное пропускается', () => {
    const rows = Object.fromEntries(
      statsRows(
        { ...hdr10, decoder: 'no', matrix: 'dolbyvision', outPrimaries: 'bt.2020', outTransfer: 'pq', outPeak: 1000, audioOutFormat: 'spdif-eac3', maxLuma: null, maxCll: null, maxFall: null },
        8,
        t,
        'ru',
      ).map((r) => [r.label, r.value]),
    )
    expect(rows['Декодер']).toBe('программный')
    expect(rows['Вывод']).toBe('HDR · BT.2020 · PQ (ST 2084) · 1000 нит')
    expect(rows['Dolby Vision']).toBe('профиль 8')
    expect(rows['Цвет']).toBe('BT.2020 · PQ (ST 2084) · Dolby Vision · ограниченный диапазон')
    expect(rows['Звук']).toContain('на ресивер')
    expect(rows['HDR']).toBeUndefined()
    expect(statsRows(empty, null, t, 'ru').map((r) => r.label)).toEqual(['Декодер'])
  })
})
