export {
  loadSettings,
  resetSettings,
  settingsStore,
  startSettingsSync,
  updateSettings,
  useSettings,
} from './model/settingsStore'
export { useHotkeyLabel } from './model/useHotkeyLabel'
export {
  DEFAULT_HOTKEYS,
  keyLabel,
  keymapOf,
  PLAYER_ACTIONS,
  rebind,
  resolveHotkeys,
  type Hotkeys,
  type PlayerAction,
  type PressedKey,
  type RebindableAction,
  type RebindResult,
} from './lib/hotkeys'
