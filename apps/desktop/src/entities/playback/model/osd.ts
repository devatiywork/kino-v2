import { createStore, useStore } from '../../../shared/lib/createStore'

interface OsdState {
  message: string | null
  /** Changes on every show so the same text restarts the timer */
  seq: number
}

const OSD_MS = 1200

export const osdStore = createStore<OsdState>({ message: null, seq: 0 })
let timer: ReturnType<typeof setTimeout> | undefined

/** Short message over the video: "Громкость 80", "Скорость 1.5×" */
export function showOsd(message: string): void {
  clearTimeout(timer)
  osdStore.set((s) => ({ message, seq: s.seq + 1 }))
  timer = setTimeout(() => osdStore.set({ message: null }), OSD_MS)
}

export function useOsd(): OsdState {
  const message = useStore(osdStore, (s) => s.message)
  const seq = useStore(osdStore, (s) => s.seq)
  return { message, seq }
}
