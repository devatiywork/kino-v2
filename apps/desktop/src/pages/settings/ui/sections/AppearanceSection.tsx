import { ACCENTS, SegmentedControl, SwatchPicker } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../entities/settings'
import { options } from '../../lib/options'
import { SettingRow, SettingsSection } from '../SettingsLayout'

const THEMES = ['dark', 'light', 'system'] as const
const LANGUAGES = ['ru', 'en'] as const

/** Theme, accent, language — applied at once (app/model/appearance.ts) */
export function AppearanceSection() {
  const { t } = useTranslation('settings')
  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  const language = useSettings((s) => s.language)

  return (
    <SettingsSection id="appearance" title={t('appearance.title')}>
      <SettingRow label={t('appearance.theme')} hint={t('appearance.themeHint')}>
        <SegmentedControl
          aria-label={t('appearance.theme')}
          options={options(THEMES, (v) => t(`appearance.themes.${v}`))}
          value={theme}
          onChange={(value) => void updateSettings({ theme: value })}
        />
      </SettingRow>
      <SettingRow label={t('appearance.accent')} hint={t('appearance.accentHint')}>
        <SwatchPicker
          aria-label={t('appearance.accent')}
          options={ACCENTS.map((value) => ({ value, label: t(`appearance.accents.${value}`), color: `var(--kino-accent-${value})` }))}
          value={accent}
          onChange={(value) => void updateSettings({ accent: value })}
        />
      </SettingRow>
      <SettingRow label={t('appearance.language')}>
        <SegmentedControl
          aria-label={t('appearance.language')}
          options={options(LANGUAGES, (v) => t(`appearance.languages.${v}`))}
          value={language}
          onChange={(value) => void updateSettings({ language: value })}
        />
      </SettingRow>
    </SettingsSection>
  )
}
