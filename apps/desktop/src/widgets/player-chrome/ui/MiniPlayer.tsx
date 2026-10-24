import { cn, IconButton, IconClose, IconPause, IconPlay, IconWindowMaximize } from '@kino/ui'
import { useRef, type MouseEvent, type PointerEvent, type WheelEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { progressRatio } from '../../../entities/library'
import { changeVolume, clickVideo, togglePause, usePlayback, VOLUME_STEP } from '../../../entities/playback'
import { windowIpc } from '../../../shared/ipc/window'

/** A press that moves this far drags the window; less — it is a click */
const DRAG_PX = 4

interface MiniPlayerProps {
  /** Back to the full window */
  onExpand: () => void
  /** The player closes: paused, the previous screen in the full window */
  onClose: () => void
}

/**
 * «Мини-плеер»: the window is the picture alone. Dragging it moves the window, a click pauses,
 * a double click (or Escape) brings the full window back; the buttons show under the mouse
 */
export function MiniPlayer({ onExpand, onClose }: MiniPlayerProps) {
  const { t } = useTranslation('player')
  const paused = usePlayback((s) => s.paused)
  const progress = usePlayback((s) => progressRatio(s.position, s.duration))
  const press = useRef<{ x: number; y: number } | null>(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    press.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = press.current
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_PX) return
    press.current = null
    windowIpc.startDragging().catch((err: unknown) => console.error('[window] drag', err))
  }
  // A click pauses or plays; a double click leaves it as it was and brings the full window back
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const pressed = press.current
    press.current = null
    if (!pressed || (e.target as Element).closest('button')) return
    clickVideo(e.detail)
  }
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) changeVolume(e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP)
  }

  return (
    <div
      role="region"
      aria-label={t('miniPlayer')}
      className="group/mini absolute inset-0 cursor-grab"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onClick={onClick}
      onDoubleClick={onExpand}
      onWheel={onWheel}
    >
      <div
        className={cn(
          'absolute inset-0 bg-linear-to-b from-scrim via-transparent to-scrim transition-opacity duration-(--duration-base)',
          paused ? 'opacity-100' : 'opacity-0 group-hover/mini:opacity-100',
        )}
      >
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          <IconButton label={t('expandPlayer')} variant="overlay" size="sm" tooltipPlacement="bottom" onPress={onExpand}>
            <IconWindowMaximize size={16} />
          </IconButton>
          <IconButton label={t('closePlayer')} variant="overlay" size="sm" tooltipPlacement="bottom" onPress={onClose}>
            <IconClose size={16} />
          </IconButton>
        </div>
        <div className="absolute inset-0 grid place-items-center">
          <IconButton label={paused ? t('play') : t('pause')} variant="overlay" size="lg" onPress={togglePause}>
            {paused ? <IconPlay size={28} /> : <IconPause size={28} />}
          </IconButton>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-track">
          <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  )
}
