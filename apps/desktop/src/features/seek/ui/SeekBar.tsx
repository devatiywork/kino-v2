import { cn } from '@kino/ui'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SEEK_STEP, seekBy, seekTo, usePlayback } from '../../../entities/playback'
import { formatTime } from '../../../shared/lib/formatTime'
import { pointerTime } from '../lib/pointerTime'

/** While dragging, mpv gets a seek at most this often */
const DRAG_SEEK_MS = 120

/** Progress bar: click and drag to seek, timecode under the pointer */
export function SeekBar() {
  const { t } = useTranslation('player')
  const position = usePlayback((s) => s.position)
  const duration = usePlayback((s) => s.duration) ?? 0
  const ref = useRef<HTMLDivElement>(null)
  const lastSeek = useRef(0)
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null)
  const [drag, setDrag] = useState<number | null>(null)

  const shown = drag ?? position
  const percent = duration > 0 ? (shown / duration) * 100 : 0
  const withHours = duration >= 3600

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, time: pointerTime(e.clientX, rect, duration) }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || duration <= 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { time } = at(e)
    setDrag(time)
    lastSeek.current = performance.now()
    seekTo(time)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const point = at(e)
    setHover(point)
    if (drag == null) return
    setDrag(point.time)
    if (performance.now() - lastSeek.current >= DRAG_SEEK_MS) {
      lastSeek.current = performance.now()
      seekTo(point.time)
    }
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag == null) return
    seekTo(at(e).time)
    setDrag(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      seekBy(e.key === 'ArrowLeft' ? -SEEK_STEP : SEEK_STEP)
    }
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t('position')}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={formatTime(shown, withHours)}
      data-dragging={drag != null || undefined}
      className="group relative flex h-5 cursor-default items-center outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-track transition-[height] duration-(--duration-fast) group-hover:h-[7px] group-data-[dragging]:h-[7px]">
        <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${percent}%` }} />
      </div>
      <div
        className={cn(
          'pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-thumb',
          'scale-0 transition-[scale] duration-(--duration-fast) group-hover:scale-100 group-data-[dragging]:scale-100',
        )}
        style={{ left: `${percent}%` }}
      />
      {hover && duration > 0 ? (
        <div
          className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-sm border border-glass-line bg-glass px-2 py-1 font-mono text-xs text-fg"
          style={{ left: hover.x }}
        >
          {formatTime(drag ?? hover.time, withHours)}
        </div>
      ) : null}
    </div>
  )
}
