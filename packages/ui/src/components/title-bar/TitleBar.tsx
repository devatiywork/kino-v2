import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface TitleBarProps {
  /** Слева: логотип, навигация */
  children: ReactNode
  /** Посередине окна: поиск */
  center?: ReactNode
  /** Справа, перед кнопками окна: действия */
  end?: ReactNode
  /** Кнопки окна справа (WindowControls) */
  controls?: ReactNode
  className?: string
}

/**
 * Свой заголовок окна вместо системного, тонкое стекло. Три колонки: средняя стоит ровно
 * посередине окна, пока крайним хватает места. Пустые места помечены data-tauri-drag-region:
 * за них окно перетаскивается, двойной клик разворачивает. Кнопки и поля внутри не тянут окно.
 */
export function TitleBar({ children, center, end, controls, className }: TitleBarProps) {
  return (
    <header
      data-tauri-drag-region
      className={cn(
        'grid h-[52px] shrink-0 grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-center gap-3.5 border-b border-line glass-titlebar',
        className,
      )}
    >
      <div data-tauri-drag-region className="flex items-center gap-3.5 self-stretch pl-[18px]">
        {children}
      </div>
      <div data-tauri-drag-region className="flex items-center self-stretch">
        {center}
      </div>
      <div data-tauri-drag-region className="flex items-center justify-end gap-3.5 self-stretch">
        {end}
        {controls}
      </div>
    </header>
  )
}
