import { useRef, type ReactNode } from 'react'
import { mergeProps, useButton, useFocusRing, useHover, useMenuTrigger, type Key, type Placement } from 'react-aria'
import { useMenuTriggerState } from 'react-stately'
import { dataFlags } from '../../lib/focusRing'
import { usePresence } from '../../lib/usePresence'
import { buttonStyles } from '../button/Button'
import { iconButtonStyles } from '../icon-button/IconButton'
import { Popover } from '../popover/Popover'
import { MenuList, type MenuItemData } from './MenuList'

export interface MenuButtonProps<T extends MenuItemData> {
  /** Подпись кнопки для скринридера (у кнопки-иконки) и меню */
  label: string
  items: ReadonlyArray<T>
  onAction?: (key: Key) => void
  /** Иконка кнопки. Без children получится кнопка-иконка */
  icon?: ReactNode
  /** Текст кнопки */
  children?: ReactNode
  variant?: 'ghost' | 'secondary' | 'outline' | 'overlay'
  placement?: Placement
  isDisabled?: boolean
  className?: string
}

/** Кнопка, открывающая меню действий: «Ещё», сортировка, действия с серией */
export function MenuButton<T extends MenuItemData>({
  label,
  items,
  onAction,
  icon,
  children,
  variant = 'ghost',
  placement = 'bottom end',
  isDisabled,
  className,
}: MenuButtonProps<T>) {
  const ref = useRef<HTMLButtonElement>(null)
  const state = useMenuTriggerState({})
  const { menuTriggerProps, menuProps } = useMenuTrigger({ isDisabled }, state, ref)
  const { buttonProps, isPressed } = useButton({ ...menuTriggerProps, isDisabled }, ref)
  const { hoverProps, isHovered } = useHover({ isDisabled })
  const { focusProps, isFocusVisible } = useFocusRing()
  const presence = usePresence(state.isOpen, 150)
  const iconOnly = !children

  const styles = iconOnly
    ? iconButtonStyles({ variant: variant === 'overlay' ? 'overlay' : 'ghost', className })
    : buttonStyles({ variant: variant === 'overlay' ? 'ghost' : variant, className })

  return (
    <>
      <button
        ref={ref}
        {...mergeProps(buttonProps, hoverProps, focusProps)}
        aria-label={iconOnly ? label : undefined}
        {...dataFlags({
          pressed: isPressed || state.isOpen,
          hovered: isHovered || state.isOpen,
          'focus-visible': isFocusVisible,
          disabled: isDisabled,
        })}
        className={styles}
      >
        {icon}
        {children}
      </button>
      {presence.isMounted ? (
        <Popover state={state} triggerRef={ref} placement={placement} isExiting={presence.isExiting}>
          <MenuList {...menuProps} aria-label={label} items={items} onAction={onAction} />
        </Popover>
      ) : null}
    </>
  )
}
