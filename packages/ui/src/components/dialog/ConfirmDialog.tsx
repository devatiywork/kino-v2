import type { ReactNode } from 'react'
import { useOverlayTriggerState } from 'react-stately'
import { Button } from '../button/Button'
import { Dialog, Modal } from './Dialog'

export interface ConfirmDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** danger — необратимое действие: кнопка красная */
  tone?: 'default' | 'danger'
  onConfirm: () => void
}

/**
 * Подтверждение вместо window.confirm. Фокус по умолчанию на «Отмене»,
 * чтобы случайный Enter не удалил данные.
 */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Отмена',
  tone = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const state = useOverlayTriggerState({ isOpen, onOpenChange })
  return (
    <Modal state={state}>
      <Dialog
        role="alertdialog"
        title={title}
        actions={
          <>
            <Button variant="secondary" onPress={state.close} autoFocus>
              {cancelLabel}
            </Button>
            <Button
              variant={tone === 'danger' ? 'destructive' : 'primary'}
              onPress={() => {
                onConfirm()
                state.close()
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {description}
      </Dialog>
    </Modal>
  )
}
