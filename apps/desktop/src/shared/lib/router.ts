import { createStore, useStore } from './createStore'

/** Screens of the window. The player covers the whole window, the rest live under the title bar */
export type Screen = 'home' | 'series' | 'history' | 'downloads' | 'settings' | 'player'

interface RouterState {
  screen: Screen
  /** Where "Back" from the player returns */
  previous: Screen
}

export const routerStore = createStore<RouterState>({ screen: 'home', previous: 'home' })

export function navigate(screen: Screen): void {
  const { screen: current } = routerStore.get()
  if (screen === current) return
  routerStore.set({ screen, previous: current === 'player' ? routerStore.get().previous : current })
}

export function goBack(): void {
  navigate(routerStore.get().previous)
}

export function useScreen(): Screen {
  return useStore(routerStore, (s) => s.screen)
}
