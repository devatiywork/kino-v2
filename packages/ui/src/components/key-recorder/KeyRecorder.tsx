import { useEffect, useRef, useState, type ReactNode } from 'react'
import { mergeProps, useButton, useFocusRing, useHover } from 'react-aria'
import { dataFlags, focusRing } from '../../lib/focusRing'
import { tv } from '../../lib/tv'

const recorderStyles = tv({
  base: [
    'inline-flex h-[30px] min-w-16 items-center justify-center rounded-sm border border-line-2 bg-field px-2.5',
    'text-sm font-medium whitespace-nowrap text-fg',
    'transition-[border-color,color] duration-(--duration-fast)',
    'data-[hovered]:border-accent data-[disabled]:opacity-40',
    'data-[listening]:border-accent data-[listening]:text-accent-fg motion-safe:data-[listening]:animate-pulse',
    focusRing,
  ],
})

/** Нажатая клавиша: code не зависит от раскладки, key — то, что напечаталось бы */
export interface RecordedKey {
  code: string
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

export interface KeyRecorderProps {
  /** Что назначено сейчас: «Пробел», «F» */
  children: ReactNode
  /** Подпись для читалки экрана: «Пауза — Пробел» */
  'aria-label': string
  /** Текст, пока ждём клавишу: «Нажмите клавишу» */
  listeningLabel: ReactNode
  /** Нажата клавиша. Escape отменяет, одни модификаторы (Shift, Ctrl…) не считаются */
  onRecord: (key: RecordedKey) => void
  isDisabled?: boolean
  className?: string
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'])

/**
 * Переназначение клавиши: нажатие включает ожидание, следующая клавиша записывается.
 * Пока ждём, клавиши не доходят ни до страницы, ни до самой кнопки. Уход фокуса — отмена.
 */
export function KeyRecorder({ children, listeningLabel, onRecord, isDisabled, className, ...props }: KeyRecorderProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const [listening, setListening] = useState(false)
  const record = useRef(onRecord)
  record.current = onRecord

  const { buttonProps, isPressed } = useButton(
    { 'aria-label': props['aria-label'], isDisabled, onPress: () => setListening((on) => !on), onBlur: () => setListening(false) },
    ref,
  )
  const { hoverProps, isHovered } = useHover({ isDisabled })
  const { focusProps, isFocusVisible } = useFocusRing()

  useEffect(() => {
    if (!listening) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (MODIFIERS.has(e.key)) return
      setListening(false)
      if (e.code === 'Escape') return
      record.current({ code: e.code, key: e.key, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey })
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [listening])

  return (
    <button
      ref={ref}
      {...mergeProps(buttonProps, hoverProps, focusProps)}
      {...dataFlags({ listening, pressed: isPressed, hovered: isHovered, 'focus-visible': isFocusVisible, disabled: isDisabled })}
      className={recorderStyles({ className })}
    >
      {listening ? listeningLabel : children}
    </button>
  )
}
