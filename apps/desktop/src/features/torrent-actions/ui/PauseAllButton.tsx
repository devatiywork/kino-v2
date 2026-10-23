import { IconButton, IconPause, IconPlay } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useTorrents } from '../../../entities/torrent'
import { torrentsIpc } from '../../../shared/ipc/torrents'

/** SPEC 4.3 «пауза и продолжение — для всех»: everything stopped — the button resumes */
export function PauseAllButton() {
  const { t } = useTranslation('torrents')
  const count = useTorrents((s) => s.active.length)
  const allPaused = useTorrents((s) => s.active.length > 0 && s.active.every((x) => x.state === 'paused'))
  const toggle = () => torrentsIpc.pauseAll(!allPaused).catch((e: unknown) => console.error('[torrents] pause all', e))
  return (
    <IconButton label={allPaused ? t('resumeAll') : t('pauseAll')} isDisabled={!count} onPress={() => void toggle()}>
      {allPaused ? <IconPlay size={17} /> : <IconPause size={17} />}
    </IconButton>
  )
}
