import { cn } from '@kino/ui'
import type { TorrentState } from '../../../shared/ipc/torrents'

const FILL: Record<TorrentState, string> = {
  downloading: 'bg-accent',
  seeding: 'bg-fg-2',
  paused: 'bg-fg-3',
  checking: 'bg-fg-3',
  error: 'bg-danger',
}

/** Progress of a torrent; the colour says what it is doing */
export function TorrentBar({ progress, state, label, className }: { progress: number; state: TorrentState; label: string; className?: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 1000) / 10
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn('h-1.5 overflow-hidden rounded-full bg-track', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-(--duration-slow)', FILL[state])} style={{ width: `${percent}%` }} />
    </div>
  )
}

/** «Загрузка», «Раздача», «Файлы удалены» */
export function StateBadge({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'accent' | 'danger' }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-xs px-1.5 text-2xs font-semibold tracking-caps whitespace-nowrap uppercase',
        tone === 'accent' && 'bg-accent-soft text-accent-fg',
        tone === 'danger' && 'bg-danger/12 text-danger',
        tone === 'neutral' && 'bg-hover text-fg-2',
      )}
    >
      {children}
    </span>
  )
}
