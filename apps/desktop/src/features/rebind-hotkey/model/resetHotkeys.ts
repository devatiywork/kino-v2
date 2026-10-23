import { updateSettings } from '../../../entities/settings'

/** «Вернуть стандартные»: the settings keep only remaps, so none of them is left */
export function resetHotkeys(): Promise<void> {
  return updateSettings({ hotkeys: {} })
}
