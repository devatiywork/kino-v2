import { useRef, type ReactNode } from 'react'
import { mergeProps, useButton, useDialog, useFocusRing, useHover, useOverlayTrigger, type Placement } from 'react-aria'
import { useOverlayTriggerState } from 'react-stately'
import { dataFlags } from '../../lib/focusRing'
import { usePresence } from '../../lib/usePresence'
import { buttonStyles } from '../button/Button'
import { iconButtonStyles } from '../icon-button/IconButton'
import { Popover } from './Popover'

export interface PopoverButtonProps {
  /** Подпись кнопки-иконки и всплывающего окна для скринридера */
  label: string
  /** Содержимое окна; функция получает close — закрыть после выбора */
  content: ReactNode | ((close: () => void) => ReactNode)
  icon?: ReactNode
  /** Текст кнопки. Без него — кнопка-иконка */
  children?: ReactNode
  variant?: 'ghost' | 'secondary' | 'outline' | 'overlay'
  placement?: Placement
  isDisabled?: boolean
  onOpenChange?: (isOpen: boolean) => void
  className?: string
  popoverClassName?: string
}

function PopoverDialog({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { dialogProps } = useDialog({ 'aria-label': label }, ref)
  return (
    <div {...dialogProps} ref={ref} className="outline-none">
      {children}
    </div>
  )
}

/**
 * Кнопка со всплывающим окном произвольного содержания: озвучка и субтитры в плеере,
 * фильтры. Для списка действий — MenuButton.
 */
export function PopoverButton({
  label,
  content,
  icon,
  children,
  variant = 'ghost',
  placement = 'top end',
  isDisabled,
  onOpenChange,
  className,
  popoverClassName,
}: PopoverButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const state = useOverlayTriggerState({ onOpenChange })
  const { triggerProps, overlayProps } = useOverlayTrigger({ type: 'dialog' }, state, ref)
  const { buttonProps, isPressed } = useButton({ ...triggerProps, isDisabled }, ref)
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
          selected: state.isOpen,
        })}
        className={styles}
      >
        {icon}
        {children}
      </button>
      {presence.isMounted ? (
        <Popover state={state} triggerRef={ref} placement={placement} isExiting={presence.isExiting} offset={10} className={popoverClassName}>
          <div {...overlayProps}>
            <PopoverDialog label={label}>{typeof content === 'function' ? content(state.close) : content}</PopoverDialog>
          </div>
        </Popover>
      ) : null}
    </>
  )
}
