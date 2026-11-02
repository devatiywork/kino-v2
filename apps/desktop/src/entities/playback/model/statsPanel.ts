import { createStore, useStore } from '../../../shared/lib/createStore'

/** «Статистика воспроизведения» over the video: shown or not (the I key) */
export const statsPanelStore = createStore({ open: false })

export function toggleStats(): void {
  statsPanelStore.set((s) => ({ open: !s.open }))
}

export function useStatsOpen(): boolean {
  return useStore(statsPanelStore, (s) => s.open)
}
