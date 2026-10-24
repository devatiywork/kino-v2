import { useRef, type ReactNode } from 'react'
import { Overlay, useDialog, useModalOverlay, type AriaDialogProps } from 'react-aria'
import type { OverlayTriggerState } from 'react-stately'
import { cn } from '../../lib/cn'
import { dataFlags } from '../../lib/focusRing'
import { usePresence } from '../../lib/usePresence'

export interface ModalProps {
  state: OverlayTriggerState
  children: ReactNode
  /** Закрывать кликом по затемнению */
  isDismissable?: boolean
}

/** Модальный слой: затемнение, фокус внутри, Escape закрывает, прокрутка под ним заблокирована */
export function Modal({ state, children, isDismissable = true }: ModalProps) {
  const presence = usePresence(state.isOpen, 150)
  if (!presence.isMounted) return null
  return (
    <ModalLayer state={state} isDismissable={isDismissable} isExiting={presence.isExiting}>
      {children}
    </ModalLayer>
  )
}

function ModalLayer({ state, children, isDismissable, isExiting }: ModalProps & { isExiting: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const { modalProps, underlayProps } = useModalOverlay({ isDismissable }, state, ref)
  return (
    <Overlay>
      {/* The page behind blurs here, not under the dialog: the dialog's pop-in animation would
          cut its own glass off from the page */}
      <div
        {...underlayProps}
        {...dataFlags({ exiting: isExiting })}
        className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-scrim/55 p-6 backdrop-blur-[6px] data-[exiting]:animate-fade-out"
      >
        <div {...modalProps} ref={ref} {...dataFlags({ exiting: isExiting })} className="animate-pop-in data-[exiting]:animate-pop-out">
          {children}
        </div>
      </div>
    </Overlay>
  )
}

export interface DialogProps extends AriaDialogProps {
  title: ReactNode
  children?: ReactNode
  /** Кнопки внизу, справа */
  actions?: ReactNode
  className?: string
}

/** Окно диалога: заголовок, текст, кнопки. Использовать внутри Modal */
export function Dialog({ title, children, actions, className, ...props }: DialogProps) {
  const ref = useRef<HTMLElement>(null)
  const { dialogProps, titleProps } = useDialog(props, ref)
  return (
    <section
      {...dialogProps}
      ref={ref}
      className={cn('flex w-[440px] max-w-full flex-col gap-3 rounded-xl border border-glass-line glass p-6 shadow-pop outline-none', className)}
    >
      <h2 {...titleProps} className="font-display text-lg font-semibold text-fg">
        {title}
      </h2>
      {children ? <div className="text-base leading-relaxed text-fg-2">{children}</div> : null}
      {actions ? <div className="mt-3 flex justify-end gap-2">{actions}</div> : null}
    </section>
  )
}
