import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface KbdProps {
  children: ReactNode
  className?: string
}

/** Подпись клавиши или сочетания: Ctrl K, Пробел, ← → */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 items-center rounded-xs border border-line-2 px-1.5 font-mono text-2xs whitespace-nowrap text-fg-3',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
