import type { PlayerSnapshot } from '../../../shared/ipc/player'
import { formatBitrate, formatSize } from '../../../shared/lib/formatBytes'

const CODECS: Record<string, string> = {
  h264: 'H.264',
  hevc: 'HEVC',
  av1: 'AV1',
  vp9: 'VP9',
  vp8: 'VP8',
  mpeg2video: 'MPEG-2',
  mpeg4: 'MPEG-4',
  vc1: 'VC-1',
}

/** «2160p», «1080p», «720p», «576p». By the width too: a 1920×800 film is 1080p */
export function resolutionLabel(width: number | null, height: number | null): string | null {
  if (!width || !height) return null
  if (width >= 3200 || height >= 1800) return '2160p'
  if (width >= 2200 || height >= 1260) return '1440p'
  if (width >= 1600 || height >= 900) return '1080p'
  if (width >= 1100 || height >= 650) return '720p'
  return `${height}p`
}

/** «HEVC», «H.264»; an unknown one as mpeg says it, in capitals */
export function codecLabel(codec: string | null): string | null {
  if (!codec) return null
  return CODECS[codec] ?? codec.toUpperCase()
}

type QualitySource = Pick<PlayerSnapshot, 'videoWidth' | 'videoHeight' | 'videoCodec' | 'hdr' | 'videoTransfer' | 'tracks' | 'fileSize' | 'duration'>

/**
 * Which HDR the picture is: «Dolby Vision P8» (by the video track's profile), «HDR10» (PQ), «HLG».
 * HDR10+ is not told apart: mpv does not say whether a file has its dynamic metadata
 */
export function hdrLabel(s: Pick<PlayerSnapshot, 'hdr' | 'videoTransfer' | 'tracks'>): string | null {
  const dv = s.tracks.find((t) => t.kind === 'video' && t.isSelected)?.dvProfile
  if (dv != null) return `Dolby Vision P${dv}`
  if (s.videoTransfer === 'pq') return 'HDR10'
  if (s.videoTransfer === 'hlg') return 'HLG'
  return s.hdr ? 'HDR' : null
}

/**
 * The player's quality line: «2160p · HEVC · Dolby Vision P8 · 52 ГБ · 47,2 Мбит/с». The bitrate is the
 * file's average (size over duration) — it does not jump from scene to scene. What is not known
 * yet (the picture before its first frame) is left out
 */
export function qualityLine(s: QualitySource, locale: string): string {
  const bitrate = s.fileSize && s.duration ? (s.fileSize * 8) / s.duration : null
  return [
    resolutionLabel(s.videoWidth, s.videoHeight),
    codecLabel(s.videoCodec),
    hdrLabel(s),
    s.fileSize ? formatSize(s.fileSize, locale) : null,
    bitrate ? formatBitrate(bitrate, locale) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
