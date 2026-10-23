import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ToastView, type ToastData } from './ToastView'

export interface ToastOptions {
  title: string
  description?: string
  tone?: ToastData['tone']
  /** Кнопка в уведомлении: «Отменить», «Открыть» */
  action?: ToastData['action']
  /** Сколько показывать, мс. По умолчанию 3000, 0 — пока не закроют */
  duration?: number
}

interface ToastApi {
  show: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)
const EXIT_MS = 150
let counter = 0

/** Уведомления в правом верхнем углу окна. Наведение мыши ставит таймер на паузу */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const remove = useCallback((id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, isExiting: true } : t)))
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), EXIT_MS)
  }, [])

  const schedule = useCallback(
    (id: string, duration: number) => {
      clearTimeout(timers.current.get(id))
      if (duration > 0) timers.current.set(id, setTimeout(() => remove(id), duration))
    },
    [remove],
  )

  const show = useCallback(
    ({ duration = 3000, tone = 'neutral', ...options }: ToastOptions) => {
      counter += 1
      const id = `toast-${counter}`
      setToasts((list) => [...list, { ...options, id, tone, duration, isExiting: false }])
      schedule(id, duration)
      return id
    },
    [schedule],
  )

  const api = useMemo<ToastApi>(() => ({ show, dismiss: remove }), [show, remove])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <section aria-label="Уведомления" className="pointer-events-none fixed top-16 right-4 z-[60] flex w-[360px] flex-col gap-2">
          {toasts.map((toast) => (
            <ToastView
              key={toast.id}
              toast={toast}
              onDismiss={() => remove(toast.id)}
              onPause={() => clearTimeout(timers.current.get(toast.id))}
              onResume={() => schedule(toast.id, toast.duration)}
            />
          ))}
        </section>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

/** Показать уведомление: const toast = useToast(); toast.show({ title: 'Дорожка не найдена' }) */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast работает только внутри ToastProvider')
  return api
}
