import { IconButton, IconGauge } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../entities/settings'
import { formatRate } from '../../../shared/lib/formatBytes'

/** SPEC 6 «Альтернативные лимиты» at hand: on and off, whatever the schedule said last */
export function AltLimitsButton() {
  const { t, i18n } = useTranslation('torrents')
  const on = useSettings((s) => s.altLimitsOn)
  const down = useSettings((s) => s.altDownloadLimit)
  const up = useSettings((s) => s.altUploadLimit)
  const rate = (kbps: number) => (kbps ? formatRate(kbps * 1024, i18n.language) : '∞')
  const toggle = () => updateSettings({ altLimitsOn: !on }).catch((e: unknown) => console.error('[torrents] alt limits', e))
  return (
    <IconButton
      label={t('altLimits')}
      tooltip={t(on ? 'altLimitsOn' : 'altLimitsOff', { down: rate(down), up: rate(up) })}
      isSelected={on}
      onPress={() => void toggle()}
    >
      <IconGauge size={17} />
    </IconButton>
  )
}
