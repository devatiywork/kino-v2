import { Switch } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../entities/settings'
import { ResetSettingsButton } from '../../../../features/reset-settings'
import { SettingRow, SettingsSection } from '../SettingsLayout'

/** SPEC 6 «Система»; the reset of all settings closes the screen */
export function SystemSection() {
  const { t } = useTranslation('settings')
  const keepAwake = useSettings((s) => s.keepAwake)
  return (
    <SettingsSection id="system" title={t('system.title')}>
      <SettingRow label={t('system.keepAwake')} hint={t('system.keepAwakeHint')}>
        <Switch aria-label={t('system.keepAwake')} isSelected={keepAwake} onChange={(on) => void updateSettings({ keepAwake: on })} />
      </SettingRow>
      <SettingRow label={t('reset.button')} hint={t('reset.hint')}>
        <ResetSettingsButton />
      </SettingRow>
    </SettingsSection>
  )
}
