import type { PlayerStats } from '../../../shared/ipc/player'
import { codecLabel } from './quality'

type T = (key: string, options?: Record<string, unknown>) => string

export interface StatsRow {
  label: string
  value: string
}

/** mpv's names of colours as people write them: «BT.2020», «PQ (ST 2084)», «гамма 2.2» */
function colour(value: string | null, t: T): string | null {
  if (!value) return null
  const known: Record<string, string> = {
    pq: 'PQ (ST 2084)',
    hlg: 'HLG',
    srgb: 'sRGB',
    linear: t('stats.linear'),
    'display-p3': 'Display P3',
    'bt.2020-ncl': 'BT.2020 NCL',
    'bt.2020-cl': 'BT.2020 CL',
    // The matrix of a frame mpv reshapes by its Dolby Vision RPU
    dolbyvision: 'Dolby Vision',
  }
  if (known[value]) return known[value]
  if (value.startsWith('gamma')) return t('stats.gamma', { value: value.slice(5) })
  return value.replace(/^bt\./, 'BT.').replace(/^dci-p3$/, 'DCI-P3')
}

const join = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ')

function number(value: number, locale: string, digits = 0): string {
  // «1000 нит», not «1 000»: figures of a technical panel, never long
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits, useGrouping: false }).format(value)
}

/**
 * «Статистика воспроизведения» as rows: the decoder, the frame, its colours and HDR metadata,
 * Dolby Vision, what goes out to the display and whether that is HDR, the drops, the sound.
 * What mpv does not know yet is left out
 */
export function statsRows(s: PlayerStats, dvProfile: number | null, t: T, locale: string): StatsRow[] {
  const nits = (value: number | null) => (value ? t('stats.nits', { value: number(value, locale) }) : null)
  const hardware = s.decoder && s.decoder !== 'no'
  const hdrOut = s.outTransfer === 'pq' || s.outTransfer === 'hlg'
  const rows: [string, string][] = [
    ['decoder', hardware ? t('stats.hardware', { decoder: s.decoder }) : t('stats.software')],
    [
      'video',
      join([
        codecLabel(s.codec),
        s.width && s.height ? `${s.width}×${s.height}` : null,
        s.pixelFormat,
        s.fps ? t('stats.fps', { value: number(s.fps, locale, 3) }) : null,
      ]),
    ],
    ['colour', join([colour(s.primaries, t), colour(s.transfer, t), colour(s.matrix, t), s.levels ? t(`stats.levels.${s.levels}`) : null])],
    [
      'hdr',
      join([
        s.maxLuma ? t('stats.mastering', { value: nits(s.maxLuma) }) : null,
        s.maxCll ? `MaxCLL ${number(s.maxCll, locale)}` : null,
        s.maxFall ? `MaxFALL ${number(s.maxFall, locale)}` : null,
      ]),
    ],
    ['dolbyVision', dvProfile != null ? t('stats.dvProfile', { profile: dvProfile }) : ''],
    ['output', join([s.outTransfer && (hdrOut ? 'HDR' : 'SDR'), colour(s.outPrimaries, t), colour(s.outTransfer, t), nits(s.outPeak)])],
    ['render', join([s.vo, s.gpuApi])],
    [
      'display',
      join([
        s.displayFps ? t('stats.hz', { value: number(s.displayFps, locale, 2) }) : null,
        s.videoSync ? t(s.videoSync.startsWith('display') ? 'stats.syncDisplay' : 'stats.syncAudio') : null,
        s.interpolation ? t('stats.interpolation') : null,
      ]),
    ],
    [
      'frames',
      s.dropped == null
        ? ''
        : t('stats.dropped', { output: s.dropped, decoder: s.decoderDropped ?? 0, delayed: s.delayed ?? 0, mistimed: s.mistimed ?? 0 }),
    ],
    [
      'audio',
      join([
        s.audioCodec?.toUpperCase(),
        s.audioChannels ? t('stats.channels', { from: s.audioChannels, to: s.audioOutChannels ?? s.audioChannels }) : null,
        s.audioOutFormat?.startsWith('spdif') ? t('stats.passthrough') : null,
        s.audioOut,
      ]),
    ],
  ]
  return rows.filter(([, value]) => value).map(([key, value]) => ({ label: t(`stats.rows.${key}`), value }))
}
