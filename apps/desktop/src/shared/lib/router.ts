import { createStore, useStore } from './createStore'

/**
 * Screens of the window. The player covers the whole window, the rest live under the title bar.
 * `show` is one series (its key in `seriesKey`), `series` — the list of series
 */
export type Screen = 'home' | 'series' | 'show' | 'history' | 'downloads' | 'settings' | 'player'

interface RouterState {
  screen: Screen
  /** Where "Back" from the player returns */
  previous: Screen
  /** The series open on the `show` screen */
  seriesKey: string | null
}

export const routerStore = createStore<RouterState>({ screen: 'home', previous: 'home', seriesKey: null })

export function navigate(screen: Screen): void {
  const { screen: current } = routerStore.get()
  if (screen === current) return
  routerStore.set({ screen, previous: current === 'player' ? routerStore.get().previous : current })
}

export function openSeries(key: string): void {
  routerStore.set({ seriesKey: key })
  if (routerStore.get().screen !== 'show') navigate('show')
}

export function goBack(): void {
  navigate(routerStore.get().previous)
}

export function useScreen(): Screen {
  return useStore(routerStore, (s) => s.screen)
}

export function useSeriesKey(): string | null {
  return useStore(routerStore, (s) => s.seriesKey)
}
