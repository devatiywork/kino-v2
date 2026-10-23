import { SegmentedControl, Slider, Switch } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SPEEDS } from '../../../../entities/playback'
import { updateSettings, useSettings } from '../../../../entities/settings'
import { SettingRow, SettingsSection } from '../SettingsLayout'

const SPEED_OPTIONS = SPEEDS.map((speed) => ({ value: String(speed), label: `${speed}×` }))

/** The volume moves with the thumb; the core gets the value once it is let go */
function DefaultVolume({ label }: { label: string }) {
  const stored = useSettings((s) => s.defaultVolume)
  const [volume, setVolume] = useState(stored)
  useEffect(() => setVolume(stored), [stored])
  return (
    <Slider
      label={label}
      value={volume}
      onChange={setVolume}
      onChangeEnd={(value) => void updateSettings({ defaultVolume: value })}
      maxValue={100}
      step={5}
      showValue
      formatOptions={{ style: 'unit', unit: 'percent' }}
      className="w-60"
    />
  )
}

/** SPEC 6 «Воспроизведение» */
export function PlaybackSection() {
  const { t } = useTranslation('settings')
  const resume = useSettings((s) => s.resume)
  const autoplay = useSettings((s) => s.autoplay)
  const speed = useSettings((s) => s.defaultSpeed)
  const hardwareDecoding = useSettings((s) => s.hardwareDecoding)

  return (
    <SettingsSection id="playback" title={t('playback.title')}>
      <SettingRow label={t('playback.resume')} hint={t('playback.resumeHint')}>
        <Switch aria-label={t('playback.resume')} isSelected={resume} onChange={(on) => void updateSettings({ resume: on })} />
      </SettingRow>
      <SettingRow label={t('playback.autoplay')} hint={t('playback.autoplayHint')}>
        <Switch aria-label={t('playback.autoplay')} isSelected={autoplay} onChange={(on) => void updateSettings({ autoplay: on })} />
      </SettingRow>
      <SettingRow label={t('playback.speed')} hint={t('playback.speedHint')}>
        <SegmentedControl
          aria-label={t('playback.speed')}
          options={SPEED_OPTIONS}
          value={String(speed)}
          onChange={(value) => void updateSettings({ defaultSpeed: Number(value) })}
          size="sm"
        />
      </SettingRow>
      <SettingRow label={t('playback.volume')} hint={t('playback.volumeHint')}>
        <DefaultVolume label={t('playback.volume')} />
      </SettingRow>
      <SettingRow label={t('playback.hwdec')} hint={t('playback.hwdecHint')}>
        <Switch aria-label={t('playback.hwdec')} isSelected={hardwareDecoding} onChange={(on) => void updateSettings({ hardwareDecoding: on })} />
      </SettingRow>
    </SettingsSection>
  )
}
