import { useRef } from 'react'
import { mergeProps, useButton, useHover, useSearchField, type AriaSearchFieldProps } from 'react-aria'
import { useSearchFieldState } from 'react-stately'
import { IconClose, IconSearch } from '../../icons'
import { cn } from '../../lib/cn'
import { Kbd } from '../kbd/Kbd'

export interface SearchFieldProps extends AriaSearchFieldProps {
  /** Подпись для скринридера; на экране — только placeholder */
  label: string
  /** Подсказка сочетания клавиш, пока поле пустое: «Ctrl K» */
  shortcut?: string
  className?: string
}

/** Поле поиска: Escape очищает, Enter — onSubmit, крестик появляется, когда есть текст */
export function SearchField({ label, shortcut, className, ...props }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const clearRef = useRef<HTMLButtonElement>(null)
  const state = useSearchFieldState(props)
  const { labelProps, inputProps, clearButtonProps } = useSearchField({ ...props, label }, state, inputRef)
  const { buttonProps } = useButton(clearButtonProps, clearRef)
  const { hoverProps, isHovered } = useHover({})

  return (
    <div
      {...hoverProps}
      data-hovered={isHovered || undefined}
      className={cn(
        'flex h-[34px] min-w-36 items-center gap-2 rounded-md border border-line-2 bg-panel pr-1 pl-3 text-fg-3',
        'transition-[border-color] duration-(--duration-fast) data-[hovered]:border-fg-3 focus-within:border-accent!',
        props.isDisabled && 'opacity-40',
        className,
      )}
    >
      <label {...labelProps} className="sr-only">
        {label}
      </label>
      <IconSearch size={16} className="shrink-0" />
      <input
        {...inputProps}
        ref={inputRef}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
      />
      {state.value ? (
        <button
          {...mergeProps(buttonProps)}
          ref={clearRef}
          className="grid size-6 shrink-0 place-items-center rounded-xs text-fg-3 hover:bg-hover-2 hover:text-fg"
        >
          <IconClose size={14} />
        </button>
      ) : shortcut ? (
        <Kbd className="mr-0.5">{shortcut}</Kbd>
      ) : null}
    </div>
  )
}
