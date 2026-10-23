import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * true after `timeout` ms without pointer movement or keys. `hold` keeps it awake
 * (a menu is open, the pointer is over the controls). Calling `wake` resets the timer.
 */
export function useIdle(timeout: number, hold = false): { idle: boolean; wake: () => void } {
  const [idle, setIdle] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const wake = useCallback(() => {
    setIdle(false)
    clearTimeout(timer.current)
    if (!hold) timer.current = setTimeout(() => setIdle(true), timeout)
  }, [timeout, hold])

  useEffect(() => {
    wake()
    window.addEventListener('pointermove', wake)
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', wake)
    return () => {
      clearTimeout(timer.current)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [wake])

  return { idle, wake }
}
