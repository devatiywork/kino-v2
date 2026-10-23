import { useTranslation } from 'react-i18next'
import { DEFAULT_HOTKEYS, keyLabel, type RebindableAction } from '../lib/hotkeys'
import { useSettings } from './settingsStore'

/** The key of an action as tooltips show it: follows a remap at once */
export function useHotkeyLabel(action: RebindableAction): string {
  const { t } = useTranslation('settings')
  const code = useSettings((s) => s.hotkeys[action] ?? DEFAULT_HOTKEYS[action])
  return keyLabel(code, t('hotkeys.space'))
}
