import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

const TRACK_INSET = 4
const MIN_THUMB = 32

interface ThumbState {
  size: number
  offset: number
}

export interface ScrollAreaProps {
  children: ReactNode
  className?: string
  /** Классы для прокручиваемой области (отступы контента и т. п.) */
  viewportClassName?: string
  /** Стили прокручиваемой области, например maxHeight у списков */
  viewportStyle?: CSSProperties
  'aria-label'?: string
}

/**
 * Прокрутка со своей полосой поверх контента: тонкая, появляется при наведении и прокрутке,
 * ползунок можно тянуть. Системная полоса скрыта глобально в base.css.
 */
export function ScrollArea({ children, className, viewportClassName, viewportStyle, 'aria-label': ariaLabel }: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [thumb, setThumb] = useState<ThumbState>({ size: 0, offset: 0 })
  const [isScrolling, setScrolling] = useState(false)

  const update = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const { scrollHeight, clientHeight, scrollTop } = el
    if (scrollHeight <= clientHeight + 1) {
      setThumb({ size: 0, offset: 0 })
      return
    }
    const track = clientHeight - TRACK_INSET * 2
    const size = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * track)
    const offset = (scrollTop / (scrollHeight - clientHeight)) * (track - size)
    setThumb({ size, offset })
  }, [])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [update])

  useEffect(() => () => clearTimeout(idleTimer.current), [])

  const onScroll = () => {
    update()
    setScrolling(true)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setScrolling(false), 900)
  }

  const scrollRatio = () => {
    const el = viewportRef.current
    if (!el) return 0
    const track = el.clientHeight - TRACK_INSET * 2
    return (el.scrollHeight - el.clientHeight) / Math.max(1, track - thumb.size)
  }

  const onThumbDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startY: event.clientY, startScroll: viewportRef.current?.scrollTop ?? 0 }
  }
  const onThumbMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const el = viewportRef.current
    if (!drag || !el) return
    el.scrollTop = drag.startScroll + (event.clientY - drag.startY) * scrollRatio()
  }
  const onThumbUp = () => {
    dragRef.current = null
  }
  const onTrackDown = (event: PointerEvent<HTMLDivElement>) => {
    const el = viewportRef.current
    if (!el) return
    const rect = event.currentTarget.getBoundingClientRect()
    const direction = event.clientY - rect.top < thumb.offset + TRACK_INSET ? -1 : 1
    el.scrollBy({ top: direction * el.clientHeight * 0.9, behavior: 'smooth' })
  }

  return (
    <div className={cn('group/scroll relative min-h-0 overflow-hidden', className)}>
      <div
        ref={viewportRef}
        onScroll={onScroll}
        aria-label={ariaLabel}
        style={viewportStyle}
        className={cn('h-full overflow-x-hidden overflow-y-auto', viewportClassName)}
      >
        {children}
      </div>
      {thumb.size > 0 ? (
        <div
          aria-hidden="true"
          onPointerDown={onTrackDown}
          data-scrolling={isScrolling || undefined}
          className={cn(
            'absolute top-1 right-0.5 bottom-1 w-2.5 opacity-0 transition-opacity duration-(--duration-slow)',
            'group-hover/scroll:opacity-100 data-[scrolling]:opacity-100 data-[scrolling]:duration-(--duration-fast)',
          )}
        >
          <div
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerCancel={onThumbUp}
            className="absolute right-0.5 w-1.5 rounded-full bg-fg/25 transition-[width,background-color] duration-(--duration-fast) hover:w-2 hover:bg-fg/40 active:bg-fg/50"
            style={{ height: thumb.size, transform: `translateY(${thumb.offset}px)` }}
          />
        </div>
      ) : null}
    </div>
  )
}
