import { useRef, type ReactNode, type RefObject } from 'react'
import {
  mergeProps,
  Overlay,
  useOverlayPosition,
  useTooltip,
  useTooltipTrigger,
  type AriaTooltipProps,
  type Placement,
} from 'react-aria'
import { useTooltipTriggerState, type TooltipTriggerState } from 'react-stately'

/** Задержка показа при наведении; при фокусе с клавиатуры подсказка появляется сразу */
const OPEN_DELAY = 600
const CLOSE_DELAY = 80

type TriggerProps = ReturnType<typeof useTooltipTrigger>['triggerProps']

export interface TooltipOptions {
  /** Текст подсказки. Пусто или false — подсказки нет */
  content?: ReactNode | false
  /** Сочетание клавиш справа: «F», «Ctrl K» */
  shortcut?: string
  placement?: Placement
  isDisabled?: boolean
}

interface TooltipBubbleProps extends AriaTooltipProps {
  state: TooltipTriggerState
  triggerRef: RefObject<Element | null>
  placement: Placement
  children: ReactNode
  shortcut?: string
}

function TooltipBubble({ state, triggerRef, placement, children, shortcut, ...props }: TooltipBubbleProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const { tooltipProps } = useTooltip(props, state)
  const { overlayProps } = useOverlayPosition({ targetRef: triggerRef, overlayRef, placement, offset: 8, isOpen: state.isOpen })

  return (
    <Overlay>
      <div
        {...mergeProps(tooltipProps, overlayProps)}
        ref={overlayRef}
        className="pointer-events-none flex animate-pop-in items-center gap-2 rounded-sm border border-glass-line glass px-2 py-1 text-xs whitespace-nowrap text-fg shadow-pop [--pop-shift:4px]"
      >
        {children}
        {shortcut ? <span className="font-mono text-2xs text-fg-3">{shortcut}</span> : null}
      </div>
    </Overlay>
  )
}

/**
 * Подсказка для любого элемента-кнопки: вместо атрибута title.
 * Возвращает props для элемента и саму подсказку, которую нужно отрисовать рядом.
 */
export function useTooltipFor(
  { content, shortcut, placement = 'top', isDisabled }: TooltipOptions,
  triggerRef: RefObject<HTMLElement | null>,
  /** Подпись элемента: если подсказка повторяет её, aria-describedby не нужен */
  accessibleLabel?: string,
): { triggerProps: TriggerProps; tooltip: ReactNode } {
  const disabled = isDisabled || content === false || content == null || content === ''
  const state = useTooltipTriggerState({ delay: OPEN_DELAY, closeDelay: CLOSE_DELAY, isDisabled: disabled })
  const { triggerProps, tooltipProps } = useTooltipTrigger(
    { delay: OPEN_DELAY, closeDelay: CLOSE_DELAY, isDisabled: disabled },
    state,
    triggerRef,
  )
  const duplicate = typeof content === 'string' && content === accessibleLabel
  const props = duplicate ? { ...triggerProps, 'aria-describedby': undefined } : triggerProps
  const tooltip =
    state.isOpen && !disabled ? (
      <TooltipBubble {...tooltipProps} state={state} triggerRef={triggerRef} placement={placement} shortcut={shortcut}>
        {content}
      </TooltipBubble>
    ) : null
  return { triggerProps: props, tooltip }
}
