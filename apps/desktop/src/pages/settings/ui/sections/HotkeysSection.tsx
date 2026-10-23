import { Button } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../../../../entities/settings'
import { HotkeyTable, resetHotkeys } from '../../../../features/rebind-hotkey'
import { SettingsSection } from '../SettingsLayout'

/** SPEC 6 «Горячие клавиши»: a table, remapped by a click and a key press */
export function HotkeysSection() {
  const { t } = useTranslation('settings')
  const remapped = useSettings((s) => Object.keys(s.hotkeys).length > 0)
  return (
    <SettingsSection
      id="hotkeys"
      title={t('hotkeys.title')}
      hint={t('hotkeys.hint')}
      actions={
        <Button variant="ghost" size="sm" isDisabled={!remapped} onPress={() => void resetHotkeys()}>
          {t('hotkeys.reset')}
        </Button>
      }
    >
      <HotkeyTable />
    </SettingsSection>
  )
}
