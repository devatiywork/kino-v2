import { IconCheck, IconClose, IconInfo, IconWarning } from '../../icons'
import { cn } from '../../lib/cn'
import { dataFlags } from '../../lib/focusRing'
import { Button } from '../button/Button'
import { IconButton } from '../icon-button/IconButton'

export interface ToastData {
  id: string
  title: string
  description?: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  action?: { label: string; onPress: () => void }
  duration: number
  isExiting: boolean
}

const TONE_ICON = {
  neutral: <IconInfo size={18} />,
  success: <IconCheck size={18} />,
  warning: <IconWarning size={18} />,
  danger: <IconWarning size={18} />,
}

const TONE_CLASS = {
  neutral: 'text-fg-2',
  success: 'text-accent',
  warning: 'text-accent',
  danger: 'text-danger',
}

interface ToastViewProps {
  toast: ToastData
  onDismiss: () => void
  onPause: () => void
  onResume: () => void
}

/** Одно уведомление: иконка тона, заголовок, текст, действие и крестик */
export function ToastView({ toast, onDismiss, onPause, onResume }: ToastViewProps) {
  return (
    <div
      role={toast.tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      {...dataFlags({ exiting: toast.isExiting })}
      className="pointer-events-auto flex animate-toast-in items-start gap-3 rounded-lg border border-glass-line bg-glass p-3 pl-3.5 shadow-pop backdrop-blur-[14px] data-[exiting]:animate-fade-out"
    >
      <span className={cn('mt-0.5 shrink-0', TONE_CLASS[toast.tone])}>{TONE_ICON[toast.tone]}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-px">
        <span className="text-base font-medium text-fg">{toast.title}</span>
        {toast.description ? <span className="text-sm text-fg-2">{toast.description}</span> : null}
        {toast.action ? (
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 self-start"
            onPress={() => {
              toast.action?.onPress()
              onDismiss()
            }}
          >
            {toast.action.label}
          </Button>
        ) : null}
      </div>
      <IconButton label="Закрыть уведомление" size="sm" tooltip={false} onPress={onDismiss} className="-mt-1 -mr-1">
        <IconClose size={14} />
      </IconButton>
    </div>
  )
}
