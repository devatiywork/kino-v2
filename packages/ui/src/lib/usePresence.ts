import { useEffect, useState } from 'react'

export interface Presence {
  /** Элемент в DOM: открыт или ещё доигрывает анимацию скрытия */
  isMounted: boolean
  /** Идёт анимация скрытия */
  isExiting: boolean
}

/** Держит элемент в DOM, пока доигрывает анимация скрытия */
export function usePresence(isOpen: boolean, exitMs: number): Presence {
  const [isMounted, setMounted] = useState(isOpen)
  const [isExiting, setExiting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      setExiting(false)
      return
    }
    setExiting(true)
    const timer = setTimeout(() => {
      setMounted(false)
      setExiting(false)
    }, exitMs)
    return () => clearTimeout(timer)
  }, [isOpen, exitMs])

  return { isMounted: isMounted || isOpen, isExiting: isExiting && !isOpen }
}
