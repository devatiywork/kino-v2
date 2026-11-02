import { SegmentedControl, Switch } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../entities/settings'
import type { Settings } from '../../../../shared/ipc/settings'
import { SettingRow, SettingsSection } from '../SettingsLayout'

type Choice = 'hdrOutput' | 'hdrMode' | 'toneMapping' | 'videoSync'
type Toggle = 'interpolation' | 'audioPassthrough' | 'audioExclusive' | 'playbackLog'

const CHOICES: Record<Choice, readonly string[]> = {
  hdrOutput: ['auto', 'off'],
  hdrMode: ['display', 'source'],
  toneMapping: ['auto', 'bt2390', 'st209440'],
  videoSync: ['audio', 'display'],
}
/** Nits; 0 — what Windows reports for the display */
const PEAKS = [0, 400, 600, 1000, 1500]

function ChoiceRow({ name }: { name: Choice }) {
  const { t } = useTranslation('settings')
  const value = useSettings((s) => s[name])
  return (
    <SettingRow label={t(`video.${name}`)} hint={t(`video.${name}Hint`)}>
      <SegmentedControl
        aria-label={t(`video.${name}`)}
        options={CHOICES[name].map((option) => ({ value: option, label: t(`video.${name}s.${option}`) }))}
        value={value}
        onChange={(next) => void updateSettings({ [name]: next } as Partial<Settings>)}
        size="sm"
      />
    </SettingRow>
  )
}

function ToggleRow({ name, isDisabled }: { name: Toggle; isDisabled?: boolean }) {
  const { t } = useTranslation('settings')
  const on = useSettings((s) => s[name])
  return (
    <SettingRow label={t(`video.${name}`)} hint={t(`video.${name}Hint`)}>
      <Switch aria-label={t(`video.${name}`)} isSelected={on} isDisabled={isDisabled} onChange={(next) => void updateSettings({ [name]: next })} />
    </SettingRow>
  )
}

/**
 * «Видео и звук»: HDR out, the display's peak and the tone mapping, the frame sync, the sound's
 * passthrough and exclusive mode, mpv's log. The defaults are mpv's own (src-tauri settings)
 */
export function VideoSection() {
  const { t } = useTranslation('settings')
  const peak = useSettings((s) => s.hdrPeak)
  const displaySync = useSettings((s) => s.videoSync === 'display')
  return (
    <SettingsSection id="video" title={t('video.title')}>
      <ChoiceRow name="hdrOutput" />
      <ChoiceRow name="hdrMode" />
      <SettingRow label={t('video.hdrPeak')} hint={t('video.hdrPeakHint')}>
        <SegmentedControl
          aria-label={t('video.hdrPeak')}
          options={PEAKS.map((nits) => ({ value: String(nits), label: nits ? String(nits) : t('video.auto') }))}
          value={String(PEAKS.includes(peak) ? peak : 0)}
          onChange={(next) => void updateSettings({ hdrPeak: Number(next) })}
          size="sm"
        />
      </SettingRow>
      <ChoiceRow name="toneMapping" />
      <ChoiceRow name="videoSync" />
      <ToggleRow name="interpolation" isDisabled={!displaySync} />
      <ToggleRow name="audioPassthrough" />
      <ToggleRow name="audioExclusive" />
      <ToggleRow name="playbackLog" />
    </SettingsSection>
  )
}
