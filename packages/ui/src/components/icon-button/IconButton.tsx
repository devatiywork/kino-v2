import { useRef, type ReactNode } from 'react'
import { mergeProps, useButton, useFocusRing, useHover, type AriaButtonProps } from 'react-aria'
import { dataFlags, focusRing } from '../../lib/focusRing'
import { tv, type VariantProps } from '../../lib/tv'

export const iconButtonStyles = tv({
  base: [
    'inline-grid shrink-0 place-items-center',
    'transition-[background-color,color,scale] duration-(--duration-fast) ease-out',
    'data-[pressed]:scale-[0.92] data-[disabled]:opacity-40 data-[selected]:text-accent',
    focusRing,
  ],
  variants: {
    variant: {
      /** На панелях приложения */
      ghost: 'text-fg-2 data-[hovered]:bg-hover data-[hovered]:text-fg',
      /** Поверх видео: всегда светлая, подложка при наведении */
      overlay: 'text-fg data-[hovered]:bg-hover-2',
      /** Главное действие: воспроизведение */
      solid: 'bg-accent text-on-accent data-[hovered]:bg-accent-hover data-[selected]:text-on-accent',
    },
    size: {
      sm: 'size-8 rounded-sm',
      md: 'size-9 rounded-md',
      lg: 'size-10 rounded-md',
      xl: 'size-12 rounded-lg',
    },
  },
  defaultVariants: { variant: 'ghost', size: 'md' },
})

export interface IconButtonProps
  extends Omit<AriaButtonProps<'button'>, 'elementType' | 'children' | 'aria-label'>,
    VariantProps<typeof iconButtonStyles> {
  /** Обязательная подпись: у кнопки без текста её читает скринридер и показывает подсказка */
  label: string
  /** Иконка */
  children: ReactNode
  /** Включённое состояние (например, «поверх окон»): иконка становится акцентной */
  isSelected?: boolean
  className?: string
}

export function IconButton({ label, variant, size, isSelected, className, children, ...props }: IconButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const { buttonProps, isPressed } = useButton({ ...props, 'aria-label': label }, ref)
  const { hoverProps, isHovered } = useHover({ isDisabled: props.isDisabled })
  const { focusProps, isFocusVisible } = useFocusRing()

  return (
    <button
      ref={ref}
      {...mergeProps(buttonProps, hoverProps, focusProps)}
      aria-pressed={isSelected}
      {...dataFlags({
        pressed: isPressed,
        hovered: isHovered,
        'focus-visible': isFocusVisible,
        disabled: props.isDisabled,
        selected: isSelected,
      })}
      className={iconButtonStyles({ variant, size, className })}
    >
      {children}
    </button>
  )
}
