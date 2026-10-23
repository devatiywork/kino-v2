import { Button, IconButton, IconClose } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { seekTo, useResume } from '../../../entities/playback'
import { formatTime } from '../../../shared/lib/formatTime'

const SHOW_MS = 6000

/** «Продолжено с 23:14 · Начать сначала» for a few seconds after opening (SPEC 3.2) */
export function ResumeBanner() {
  const { t } = useTranslation('library')
  const { from, seq } = useResume()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (from == null) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), SHOW_MS)
    return () => clearTimeout(timer)
  }, [from, seq])

  if (!visible || from == null) return null
  return (
    <div
      role="status"
      className="absolute top-[66px] left-1/2 z-20 flex -translate-x-1/2 animate-fade-in items-center gap-3.5 rounded-lg border border-glass-line bg-panel py-2 pr-2 pl-4 text-base text-fg"
    >
      <span>{t('resumed', { time: formatTime(from) })}</span>
      <Button
        variant="ghost"
        size="sm"
        className="text-accent-fg"
        onPress={() => {
          seekTo(0)
          setVisible(false)
        }}
      >
        {t('restart')}
      </Button>
      <IconButton label={t('dismiss')} size="sm" variant="overlay" tooltip={false} onPress={() => setVisible(false)}>
        <IconClose size={14} />
      </IconButton>
    </div>
  )
}
