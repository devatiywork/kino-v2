import { DEFAULT_SETTINGS, settingsIpc, type Settings } from '../../../shared/ipc/settings'
import { createStore, useStore } from '../../../shared/lib/createStore'

/** Settings mirrored from the core; loaded before the first render (app/main.tsx) */
export const settingsStore = createStore<Settings>(DEFAULT_SETTINGS)

export function useSettings<R>(selector: (state: Settings) => R): R {
  return useStore(settingsStore, selector)
}

/** Before the first render, so the theme and the language do not flash */
export async function loadSettings(): Promise<Settings> {
  try {
    settingsStore.set(await settingsIpc.get())
  } catch (e: unknown) {
    console.error('[settings] load', e)
  }
  return settingsStore.get()
}

/** The core announces every change (also the ones made elsewhere). Returns the unsubscribe */
export function startSettingsSync(): () => void {
  const unlisten = settingsIpc.onChanged((settings) => settingsStore.set(settings))
  return () => {
    unlisten.then((u) => u()).catch((e: unknown) => console.error('[settings] unlisten', e))
  }
}

/**
 * SPEC 6: a change applies at once, without «Save». The control moves right away; the core
 * stores and applies the change. If it refuses, its own values come back
 */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  settingsStore.set(patch)
  try {
    settingsStore.set(await settingsIpc.update(patch))
  } catch (e: unknown) {
    console.error('[settings] update', e)
    await loadSettings()
  }
}

export async function resetSettings(): Promise<void> {
  settingsStore.set(await settingsIpc.reset())
}
