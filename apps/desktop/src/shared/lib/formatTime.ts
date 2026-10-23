/**
 * Timecode as in the player: 4:05, 23:14, 1:02:03. With `withHours` the hours are
 * shown even when zero, so both times of a long video have the same width.
 */
export function formatTime(seconds: number | null | undefined, withHours = false): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return withHours ? '0:00:00' : '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0 || withHours) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

/** "−12:30" — what is left until the end */
export function formatRemaining(position: number, duration: number | null): string {
  if (duration == null) return formatTime(null)
  const withHours = duration >= 3600
  return `−${formatTime(Math.max(0, duration - position), withHours)}`
}
