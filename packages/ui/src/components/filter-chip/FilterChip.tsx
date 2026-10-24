import { cn } from '../../lib/cn'
import { Pressable } from '../pressable/Pressable'

export interface FilterChipProps {
  label: string
  /** Сколько оставит фильтр; без числа — не показывается */
  count?: number
  isSelected: boolean
  onPress: () => void
}

/**
 * Фильтр списка круглой кнопкой: «Все 42», «Сериалы 12». Для экранного диктора — кнопка-
 * переключатель (aria-pressed), выбранная подсвечена акцентом
 */
export function FilterChip({ label, count, isSelected, onPress }: FilterChipProps) {
  return (
    <Pressable
      aria-pressed={isSelected}
      onPress={onPress}
      className={cn(
        'flex h-8 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors duration-(--duration-fast)',
        isSelected ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-panel text-fg-2 data-[hovered]:text-fg',
      )}
    >
      {label}
      {count != null ? <span className="font-mono text-2xs text-fg-3">{count}</span> : null}
    </Pressable>
  )
}
