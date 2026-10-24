import { Button, IconArrowDown } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useTorrents } from '../../../entities/torrent'
import { formatRate } from '../../../shared/lib/formatBytes'
import { navigate, useScreen } from '../../../shared/lib/router'

/**
 * The total download speed while something downloads, on every screen but «Загрузки» itself; opens them.
 * Not in a window narrower than 1100 px: the title bar has no room (the number on «Загрузки» stays)
 */
export function DownloadSpeed() {
  const { t, i18n } = useTranslation()
  const screen = useScreen()
  const speed = useTorrents((s) => s.downloadSpeed)
  if (speed <= 0 || screen === 'downloads') return null
  const rate = formatRate(speed, i18n.language)
  return (
    <Button
      size="sm"
      aria-label={t('nav.downloadSpeed', { rate })}
      icon={<IconArrowDown size={13} className="text-accent" />}
      onPress={() => navigate('downloads')}
      className="h-7 gap-1.5 px-2.5 font-mono text-xs font-normal text-fg-2 data-[hovered]:text-fg max-[1100px]:hidden"
    >
      {rate}
    </Button>
  )
}
