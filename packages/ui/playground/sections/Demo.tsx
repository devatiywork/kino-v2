import type { ReactNode } from 'react'

/** Карточка с примером: заголовок и область с компонентами */
export function Demo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-5">
      <h3 className="text-2xs font-semibold tracking-(--tracking-caps) text-fg-3 uppercase">{title}</h3>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}
