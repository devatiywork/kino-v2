import { useRef, type ReactNode } from 'react'
import { mergeProps, useButton, useFocusRing, useHover, type AriaButtonProps } from 'react-aria'
import { dataFlags, focusRing } from '../../lib/focusRing'
import { tv, type VariantProps } from '../../lib/tv'

export const buttonStyles = tv({
  base: [
    'inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap',
    'transition-[background-color,color,border-color,scale] duration-(--duration-fast) ease-out',
    'data-[pressed]:scale-[0.97] data-[disabled]:opacity-40',
    focusRing,
  ],
  variants: {
    variant: {
      primary: 'bg-accent font-semibold text-on-accent data-[hovered]:bg-accent-hover',
      secondary: 'bg-hover text-fg data-[hovered]:bg-hover-2',
      outline: 'border border-line-2 text-fg data-[hovered]:bg-hover',
      ghost: 'text-fg-2 data-[hovered]:bg-hover data-[hovered]:text-fg',
      danger: 'border border-danger/45 text-danger data-[hovered]:bg-danger/12',
    },
    size: {
      sm: 'h-8 rounded-sm px-3 text-sm',
      md: 'h-[34px] rounded-md px-3.5 text-base',
      lg: 'h-[46px] rounded-lg px-5 text-md',
    },
  },
  defaultVariants: { variant: 'secondary', size: 'md' },
})

export interface ButtonProps extends Omit<AriaButtonProps<'button'>, 'elementType'>, VariantProps<typeof buttonStyles> {
  /** Иконка перед текстом */
  icon?: ReactNode
  className?: string
}

/** Кнопка. Нажатие — через onPress: одинаково для мыши, клавиатуры и тача, без браузерных «кликов» */
export function Button({ variant, size, icon, className, children, ...props }: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const { buttonProps, isPressed } = useButton(props, ref)
  const { hoverProps, isHovered } = useHover({ isDisabled: props.isDisabled })
  const { focusProps, isFocusVisible } = useFocusRing()

  return (
    <button
      ref={ref}
      {...mergeProps(buttonProps, hoverProps, focusProps)}
      {...dataFlags({ pressed: isPressed, hovered: isHovered, 'focus-visible': isFocusVisible, disabled: props.isDisabled })}
      className={buttonStyles({ variant, size, className })}
    >
      {icon}
      {children}
    </button>
  )
}
