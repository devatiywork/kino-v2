import { useRef, type ReactNode } from 'react'
import { mergeProps, useButton, useFocusRing, useHover, type AriaButtonProps } from 'react-aria'
import { cn } from '../../lib/cn'
import { dataFlags, focusRing } from '../../lib/focusRing'

export interface PressableProps extends Omit<AriaButtonProps<'div'>, 'elementType' | 'children'> {
  /** Любое блочное содержимое: карточка, строка истории */
  children: ReactNode
  className?: string
}

/**
 * Нажимаемая поверхность без собственного вида: карточки «Не досмотрено», строки истории.
 * Ведёт себя как кнопка (Enter, Пробел, фокус с клавиатуры); состояние — в data-hovered,
 * data-pressed, data-focus-visible, чтобы содержимое реагировало через group-data-[…].
 */
export function Pressable({ children, className, ...props }: PressableProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { buttonProps, isPressed } = useButton({ ...props, elementType: 'div' }, ref)
  const { hoverProps, isHovered } = useHover({ isDisabled: props.isDisabled })
  const { focusProps, isFocusVisible } = useFocusRing()
  return (
    <div
      ref={ref}
      {...mergeProps(buttonProps, hoverProps, focusProps)}
      {...dataFlags({ hovered: isHovered, pressed: isPressed, 'focus-visible': isFocusVisible, disabled: props.isDisabled })}
      className={cn('group outline-none', focusRing, className)}
    >
      {children}
    </div>
  )
}
