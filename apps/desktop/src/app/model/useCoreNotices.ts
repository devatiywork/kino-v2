import { useToast } from '@kino/ui'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { onAutoplayed } from '../../entities/playback'
import { playerIpc } from '../../shared/ipc/player'
import { torrentsIpc } from '../../shared/ipc/torrents'

const report = (what: string) => (e: unknown) => console.error(`[app] ${what}`, e)

/** What the core tells on its own: a remembered track is missing, the next episode started */
export function useCoreNotices(): void {
  const { t } = useTranslation('library')
  const toast = useToast()

  // SPEC 3.3: «Дорожка "LostFilm" не найдена, выбрана: English»
  useEffect(() => {
    const unlisten = playerIpc.onNotice((notice) => {
      if (notice.type !== 'trackNotFound') return
      const opts = { wanted: notice.wanted, chosen: notice.chosen }
      const title =
        notice.track === 'sub'
          ? t('trackNotFound.sub', opts)
          : notice.chosen
            ? t('trackNotFound.audio', opts)
            : t('trackNotFound.audioNone', opts)
      toast.show({ title, duration: 6000 })
    })
    return () => {
      unlisten.then((u) => u()).catch(report('notices'))
    }
  }, [t, toast])

  // SPEC 4.6: a torrent finished (and with «Не раздавать после загрузки» went to the archive)
  useEffect(() => {
    const unlisten = torrentsIpc.onNotice((notice) => {
      const key = notice.archived ? 'toast.finishedArchived' : 'toast.finished'
      toast.show({ title: t(key, { ns: 'torrents', name: notice.name }), tone: 'success', duration: 6000 })
    })
    return () => {
      unlisten.then((u) => u()).catch(report('torrent notices'))
    }
  }, [t, toast])

  useEffect(() => {
    const unlisten = playerIpc.onAutoplay(onAutoplayed)
    return () => {
      unlisten.then((u) => u()).catch(report('autoplay'))
    }
  }, [])
}
