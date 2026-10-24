import { useRef, type ReactNode, type RefObject } from 'react'
import { DismissButton, Overlay, usePopover, type AriaPopoverProps } from 'react-aria'
import type { OverlayTriggerState } from 'react-stately'
import { dataFlags } from '../../lib/focusRing'
import { tv } from '../../lib/tv'

/** Поверхность всплывающих окон: меню, списки, подсказки с действиями */
export const popoverStyles = tv({
  base: [
    'rounded-lg border border-glass-line bg-glass text-fg shadow-pop backdrop-blur-[14px] outline-none',
    'animate-pop-in data-[exiting]:animate-pop-out',
    'data-[placement=top]:[--pop-shift:6px] data-[placement=bottom]:[--pop-shift:-6px]',
  ],
})

export interface PopoverProps extends Omit<AriaPopoverProps, 'popoverRef' | 'triggerRef'> {
  state: OverlayTriggerState
  triggerRef: RefObject<Element | null>
  children: ReactNode
  /** Идёт анимация скрытия (см. usePresence) */
  isExiting?: boolean
  /** Ширина не меньше ширины кнопки, которая открыла окно */
  matchTriggerWidth?: boolean
  /** Свой ref окна — когда он нужен снаружи (комбобокс следит, куда ушёл фокус) */
  popoverRef?: RefObject<HTMLDivElement | null>
  className?: string
}

/**
 * Всплывающее окно, привязанное к кнопке: позиционирование, закрытие по клику вне и Escape,
 * возврат фокуса. Рендерится в портал поверх всего интерфейса.
 */
export function Popover({
  state,
  triggerRef,
  children,
  isExiting,
  matchTriggerWidth,
  popoverRef: outerRef,
  className,
  offset = 6,
  placement = 'bottom start',
  ...props
}: PopoverProps) {
  const ownRef = useRef<HTMLDivElement>(null)
  const popoverRef = outerRef ?? ownRef
  const { popoverProps, underlayProps, placement: actual } = usePopover(
    { ...props, offset, placement, triggerRef, popoverRef },
    state,
  )
  const triggerWidth = matchTriggerWidth && triggerRef.current instanceof HTMLElement ? triggerRef.current.offsetWidth : undefined

  return (
    <Overlay>
      {!props.isNonModal ? <div {...underlayProps} className="fixed inset-0" /> : null}
      <div
        {...popoverProps}
        ref={popoverRef}
        data-placement={actual ?? undefined}
        {...dataFlags({ exiting: isExiting })}
        style={{ ...popoverProps.style, minWidth: triggerWidth }}
        className={popoverStyles({ className })}
      >
        {!props.isNonModal ? <DismissButton onDismiss={state.close} /> : null}
        {children}
        <DismissButton onDismiss={state.close} />
      </div>
    </Overlay>
  )
}
