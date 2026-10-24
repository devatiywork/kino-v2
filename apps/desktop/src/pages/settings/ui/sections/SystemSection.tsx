import { Switch } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../entities/settings'
import { ResetSettingsButton } from '../../../../features/reset-settings'
import { DefaultAppsRow } from '../DefaultAppsRow'
import { SettingRow, SettingsSection } from '../SettingsLayout'
import { UpdatesRow } from '../UpdatesRow'

/**
 * SPEC 6 «Система»; the reset of all settings closes the screen. «Одно окно» is not a choice: a
 * second Kino would share the database and the torrents, so a later start opens its file here
 */
export function SystemSection() {
  const { t } = useTranslation('settings')
  const keepAwake = useSettings((s) => s.keepAwake)
  const mediaKeys = useSettings((s) => s.mediaKeys)
  return (
    <SettingsSection id="system" title={t('system.title')}>
      <DefaultAppsRow kinds={['video']} label={t('system.openVideo')} />
      <SettingRow label={t('system.mediaKeys')} hint={t('system.mediaKeysHint')}>
        <Switch aria-label={t('system.mediaKeys')} isSelected={mediaKeys} onChange={(on) => void updateSettings({ mediaKeys: on })} />
      </SettingRow>
      <SettingRow label={t('system.keepAwake')} hint={t('system.keepAwakeHint')}>
        <Switch aria-label={t('system.keepAwake')} isSelected={keepAwake} onChange={(on) => void updateSettings({ keepAwake: on })} />
      </SettingRow>
      <UpdatesRow />
      <SettingRow label={t('reset.button')} hint={t('reset.hint')}>
        <ResetSettingsButton />
      </SettingRow>
    </SettingsSection>
  )
}
