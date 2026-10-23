import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface TitleBarProps {
  /** Содержимое слева направо: логотип, навигация, поиск, действия. Свободное место — TitleBarSpacer */
  children: ReactNode
  /** Кнопки окна справа (WindowControls) */
  controls?: ReactNode
  className?: string
}

/**
 * Свой заголовок окна вместо системного. Пустые места помечены data-tauri-drag-region:
 * за них окно перетаскивается, двойной клик разворачивает. Кнопки и поля внутри не тянут окно.
 */
export function TitleBar({ children, controls, className }: TitleBarProps) {
  return (
    <header
      data-tauri-drag-region
      className={cn('flex h-[52px] shrink-0 items-center gap-3.5 border-b border-line bg-bg pl-[18px]', className)}
    >
      {children}
      {controls}
    </header>
  )
}

/** Растягивающийся промежуток в заголовке, за который можно тянуть окно */
export function TitleBarSpacer() {
  return <div data-tauri-drag-region className="flex-1 self-stretch" />
}
