import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { statsRows, usePlayback, useStatsOpen } from '../../../entities/playback'
import { useHotkeyLabel } from '../../../entities/settings'
import { playerIpc, type PlayerStats as Stats } from '../../../shared/ipc/player'

/** mpv's figures change while it plays: read again every second the panel is open */
const REFRESH_MS = 1000

/**
 * «Статистика воспроизведения» over the video (the I key): what mpv actually does with the file —
 * the decoder, the frame, HDR in and out, the drops, the sound
 */
export function PlayerStats() {
  const { t, i18n } = useTranslation('player')
  const open = useStatsOpen()
  const key = useHotkeyLabel('toggleStats')
  const dvProfile = usePlayback((s) => s.tracks.find((track) => track.kind === 'video' && track.isSelected)?.dvProfile ?? null)
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    const load = () =>
      playerIpc
        .stats()
        .then((next) => alive && setStats(next))
        .catch((e: unknown) => console.error('[player] stats', e))
    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [open])

  if (!open || !stats) return null
  return (
    <section
      aria-label={t('stats.title')}
      className="pointer-events-none absolute top-[70px] left-6 z-20 w-[min(460px,calc(100%-48px))] animate-fade-in rounded-lg border border-glass-line bg-glass px-4 py-3 text-fg"
    >
      <h2 className="mb-2 flex items-baseline justify-between gap-3 text-sm font-semibold">
        {t('stats.title')}
        <span className="font-mono text-2xs font-normal text-fg-3">{t('stats.toggle', { key })}</span>
      </h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono text-xs">
        {statsRows(stats, dvProfile, t, i18n.language).map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-fg-3">{row.label}</dt>
            <dd className="min-w-0 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
