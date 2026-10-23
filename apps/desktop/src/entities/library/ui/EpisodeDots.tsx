import { cn } from '@kino/ui'

/** Season as a strip: one segment per episode, filled as far as it was watched (SPEC 3.2) */
export function EpisodeDots({ progress, className }: { progress: number[]; className?: string }) {
  return (
    <div className={cn('flex gap-0.5', className)} aria-hidden="true">
      {progress.map((p, i) => (
        <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-raise-2">
          <span className="block h-full bg-accent" style={{ width: `${Math.round(p * 100)}%` }} />
        </span>
      ))}
    </div>
  )
}
