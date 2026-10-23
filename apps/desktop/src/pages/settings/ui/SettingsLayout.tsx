import { cn } from '@kino/ui'
import { useId, type ReactNode } from 'react'

/** A section of the settings: a heading and a card of rows; `id` — for the side menu */
export function SettingsSection({ id, title, hint, actions, children }: { id: string; title: string; hint?: string; actions?: ReactNode; children: ReactNode }) {
  const headingId = useId()
  return (
    <section id={id} aria-labelledby={headingId} className="flex scroll-mt-5 flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={headingId} className="font-display text-lg font-semibold tracking-display text-fg">
            {title}
          </h2>
          {hint ? <p className="text-sm text-fg-3">{hint}</p> : null}
        </div>
        {actions}
      </div>
      <div className="rounded-lg border border-line bg-panel">{children}</div>
    </section>
  )
}

/** One setting: its name, an explanation, the control on the right (or below — `stacked`) */
export function SettingRow({ label, hint, stacked, children }: { label: string; hint?: string; stacked?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex gap-5 border-t border-line px-[18px] py-3.5 first:border-t-0', stacked ? 'flex-col gap-2.5' : 'items-center')}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-medium text-fg">{label}</span>
        {hint ? <span className="text-sm leading-snug text-fg-3">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}
