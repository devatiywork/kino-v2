import { SegmentedControl } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../entities/settings'
import { options } from '../../lib/options'
import { SettingRow, SettingsSection } from '../SettingsLayout'

const AUDIOS = ['russian', 'original'] as const
const RUSSIAN_SUBS = ['off', 'forced', 'full'] as const
const SIZES = ['small', 'medium', 'large'] as const
const POSITIONS = ['bottom', 'raised', 'high'] as const

/** SPEC 6 «Озвучка и субтитры»: for files nothing is remembered for (the series memory wins) */
export function TracksSection() {
  const { t } = useTranslation('settings')
  const audio = useSettings((s) => s.preferredAudio)
  const russianSubs = useSettings((s) => s.russianAudioSubtitles)
  const size = useSettings((s) => s.subtitleSize)
  const position = useSettings((s) => s.subtitlePosition)

  return (
    <SettingsSection id="tracks" title={t('tracks.title')} hint={t('tracks.hint')}>
      <SettingRow label={t('tracks.audio')} hint={t('tracks.audioHint')}>
        <SegmentedControl
          aria-label={t('tracks.audio')}
          options={options(AUDIOS, (v) => t(`tracks.audios.${v}`))}
          value={audio}
          onChange={(value) => void updateSettings({ preferredAudio: value })}
        />
      </SettingRow>
      <SettingRow label={t('tracks.russianSubs')} hint={t('tracks.russianSubsHint')}>
        <SegmentedControl
          aria-label={t('tracks.russianSubs')}
          options={options(RUSSIAN_SUBS, (v) => t(`tracks.russianSubsOptions.${v}`))}
          value={russianSubs}
          onChange={(value) => void updateSettings({ russianAudioSubtitles: value })}
        />
      </SettingRow>
      <SettingRow label={t('tracks.size')}>
        <SegmentedControl
          aria-label={t('tracks.size')}
          options={options(SIZES, (v) => t(`tracks.sizes.${v}`))}
          value={size}
          onChange={(value) => void updateSettings({ subtitleSize: value })}
        />
      </SettingRow>
      <SettingRow label={t('tracks.position')} hint={t('tracks.positionHint')}>
        <SegmentedControl
          aria-label={t('tracks.position')}
          options={options(POSITIONS, (v) => t(`tracks.positions.${v}`))}
          value={position}
          onChange={(value) => void updateSettings({ subtitlePosition: value })}
        />
      </SettingRow>
    </SettingsSection>
  )
}
