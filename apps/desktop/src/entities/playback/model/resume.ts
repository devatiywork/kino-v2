import { createStore, useStore } from '../../../shared/lib/createStore'

interface ResumeState {
  /** The just opened file continued from here; null — from the start */
  from: number | null
  /** Changes on every open, so the banner shows again for the next file */
  seq: number
}

export const resumeStore = createStore<ResumeState>({ from: null, seq: 0 })

export function setResumed(from: number | null): void {
  resumeStore.set((s) => ({ from, seq: s.seq + 1 }))
}

export function useResume(): ResumeState {
  const from = useStore(resumeStore, (s) => s.from)
  const seq = useStore(resumeStore, (s) => s.seq)
  return { from, seq }
}
