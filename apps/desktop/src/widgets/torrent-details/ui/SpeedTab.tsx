import { SegmentedControl } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { torrentsIpc } from '../../../shared/ipc/torrents'
import { formatRate } from '../../../shared/lib/formatBytes'

const SPANS = [60, 300, 1800] as const
type Span = (typeof SPANS)[number]

/** The line of one speed over the chart's width: the newest second on the right */
function line(samples: number[], span: number, top: number): string {
  const start = span - samples.length
  return samples.map((value, i) => `${start + i},${top ? 100 - (value / top) * 100 : 100}`).join(' ')
}

/** «Скорость» (SPEC 4.3): download and upload for the last 1, 5 or 30 minutes, a sample a second */
export function SpeedTab({ id }: { id: number }) {
  const { t, i18n } = useTranslation('torrents')
  const [span, setSpan] = useState<Span>(300)
  const [history, setHistory] = useState<[number, number][]>([])

  useEffect(() => {
    let current = true
    const load = () =>
      void torrentsIpc
        .speedHistory(id)
        .then((samples) => current && setHistory(samples))
        .catch((e: unknown) => console.error('[torrents] speeds', e))
    load()
    const timer = setInterval(load, 1000)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [id])

  const shown = history.slice(-span)
  const down = shown.map(([d]) => d)
  const up = shown.map(([, u]) => u)
  const top = Math.max(1, ...down, ...up)

  return (
    <div className="flex h-full min-h-40 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <SegmentedControl
          aria-label={t('details.speedSpan')}
          size="sm"
          options={[
            { value: '60', label: t('details.minutes', { count: 1 }) },
            { value: '300', label: t('details.minutes', { count: 5 }) },
            { value: '1800', label: t('details.minutes', { count: 30 }) },
          ]}
          value={String(span)}
          onChange={(value) => setSpan(Number(value) as Span)}
        />
        <span className="flex items-center gap-1.5 text-fg-2">
          <span className="h-0.5 w-4 rounded-full bg-accent" />
          {t('details.downSpeed')}
        </span>
        <span className="flex items-center gap-1.5 text-fg-2">
          <span className="h-0.5 w-4 rounded-full bg-fg-3" />
          {t('details.upSpeed')}
        </span>
        <span className="flex-1" />
        <span className="font-mono text-xs text-fg-3">{t('details.peak', { rate: formatRate(top, i18n.language) })}</span>
      </div>
      {shown.length < 2 ? (
        <p className="py-6 text-center text-sm text-fg-3">{t('details.speedSoon')}</p>
      ) : (
        <svg
          role="img"
          aria-label={t('details.speedChart')}
          viewBox={`0 0 ${span} 100`}
          preserveAspectRatio="none"
          className="min-h-28 w-full flex-1 rounded-sm border border-line bg-bg"
        >
          <polyline points={line(up, span, top)} className="fill-none stroke-fg-3" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <polyline points={line(down, span, top)} className="fill-none stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  )
}
