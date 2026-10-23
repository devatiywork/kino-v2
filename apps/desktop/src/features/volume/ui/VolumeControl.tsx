import { IconButton, IconMute, IconVolume, Slider } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { setVolume, toggleMute, usePlayback } from '../../../entities/playback'
import { useHotkeyLabel } from '../../../entities/settings'
import { VOLUME_MAX } from '../../../shared/ipc/player'

/** Mute button, slider 0–130 and the value */
export function VolumeControl() {
  const { t } = useTranslation('player')
  const volume = usePlayback((s) => s.volume)
  const muted = usePlayback((s) => s.muted)
  const muteKey = useHotkeyLabel('toggleMute')
  const shown = muted ? 0 : Math.round(volume)

  return (
    <div className="ml-1 flex items-center gap-1.5">
      <IconButton label={muted ? t('unmute') : t('mute')} variant="overlay" size="lg" shortcut={muteKey} onPress={toggleMute}>
        {muted || shown === 0 ? <IconMute size={22} /> : <IconVolume size={22} />}
      </IconButton>
      <Slider
        label={t('volume')}
        className="w-24"
        minValue={0}
        maxValue={VOLUME_MAX}
        step={1}
        value={shown}
        onChange={(v) => setVolume(v)}
      />
      <span className="w-7 font-mono text-xs text-fg-2">{shown}</span>
    </div>
  )
}
