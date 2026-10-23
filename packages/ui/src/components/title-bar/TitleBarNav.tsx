import { useRef } from 'react'
import { mergeProps, useButton, useFocusRing, useHover } from 'react-aria'
import { dataFlags, focusRing } from '../../lib/focusRing'
import { cn } from '../../lib/cn'

export interface NavItem<K extends string = string> {
  id: K
  label: string
  /** Число на акцентном кружке: активные загрузки */
  badge?: number
}

export interface TitleBarNavProps<K extends string> {
  /** Подпись навигации для скринридера */
  label: string
  items: ReadonlyArray<NavItem<K>>
  /** Текущий раздел; null — открыт экран вне навигации (например, плеер) */
  current: K | null
  onNavigate: (id: K) => void
  className?: string
}

function NavButton<K extends string>({ item, isCurrent, onNavigate }: { item: NavItem<K>; isCurrent: boolean; onNavigate: (id: K) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const { buttonProps, isPressed } = useButton({ onPress: () => onNavigate(item.id) }, ref)
  const { hoverProps, isHovered } = useHover({})
  const { focusProps, isFocusVisible } = useFocusRing()
  return (
    <button
      ref={ref}
      {...mergeProps(buttonProps, hoverProps, focusProps)}
      aria-current={isCurrent ? 'page' : undefined}
      {...dataFlags({ hovered: isHovered, pressed: isPressed, 'focus-visible': isFocusVisible, selected: isCurrent })}
      className={cn(
        'inline-flex h-8 items-center rounded-sm px-3 text-base font-medium whitespace-nowrap text-fg-2',
        'transition-colors duration-(--duration-fast)',
        'data-[hovered]:bg-hover data-[hovered]:text-fg data-[selected]:bg-raise data-[selected]:text-fg',
        focusRing,
      )}
    >
      {item.label}
      {item.badge ? (
        <span className="ml-1.5 inline-block h-[18px] min-w-[18px] rounded-full bg-accent px-[5px] text-center font-mono text-2xs leading-[18px] font-semibold text-on-accent">
          {item.badge}
        </span>
      ) : null}
    </button>
  )
}

/** Разделы в заголовке окна: Главная · Сериалы · История · Загрузки */
export function TitleBarNav<K extends string>({ label, items, current, onNavigate, className }: TitleBarNavProps<K>) {
  return (
    <nav aria-label={label} className={cn('ml-2 flex gap-0.5', className)}>
      {items.map((item) => (
        <NavButton key={item.id} item={item} isCurrent={item.id === current} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}
