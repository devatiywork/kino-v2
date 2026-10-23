import { MenuButton } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { setSpeed, SPEEDS, usePlayback } from '../../../entities/playback'

export const formatSpeed = (speed: number) => `${Number.isInteger(speed) ? speed.toFixed(1) : String(speed)}×`

/** 0.5× … 2× */
export function SpeedButton() {
  const { t } = useTranslation('player')
  const speed = usePlayback((s) => s.speed)
  const items = SPEEDS.map((s) => ({ id: String(s), label: formatSpeed(s) }))

  return (
    <MenuButton label={t('speed')} variant="overlay" placement="top end" items={items} onAction={(key) => setSpeed(Number(key))}>
      <span className="font-mono text-sm">{formatSpeed(speed)}</span>
    </MenuButton>
  )
}
