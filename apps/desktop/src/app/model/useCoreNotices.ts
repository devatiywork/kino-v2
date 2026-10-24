import { useToast } from '@kino/ui'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { onAutoplayed } from '../../entities/playback'
import { showStatus } from '../../entities/tracker'
import { openMagnetDialog, openTorrentFile, submitMagnet } from '../../features/add-torrent'
import { playerIpc } from '../../shared/ipc/player'
import { torrentsIpc } from '../../shared/ipc/torrents'
import { trackersIpc } from '../../shared/ipc/trackers'
import { formatDecimal } from '../../shared/lib/formatBytes'

const report = (what: string) => (e: unknown) => console.error(`[app] ${what}`, e)

/** What the core tells on its own: a remembered track is missing, the next episode started */
export function useCoreNotices(): void {
  const { t, i18n } = useTranslation('library')
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
      const title =
        notice.type === 'seeded'
          ? t('toast.seeded', { ns: 'torrents', name: notice.name, ratio: formatDecimal(notice.ratio, i18n.language) })
          : t(notice.archived ? 'toast.finishedArchived' : 'toast.finished', { ns: 'torrents', name: notice.name })
      toast.show({ title, tone: 'success', duration: 6000 })
    })
    return () => {
      unlisten.then((u) => u()).catch(report('torrent notices'))
    }
  }, [t, toast])

  // SPEC 4.5: what the trackers browser caught goes to the add dialog with its release page
  useEffect(() => {
    const tt = (key: string, options?: Record<string, unknown>) => t(key, { ns: 'torrents', ...options })
    const unlisteners = [
      trackersIpc.onTorrent(({ target, sourceUrl }) => {
        showStatus({ kind: 'torrent', text: tt('trackers.interceptedTorrent') })
        openTorrentFile(target, sourceUrl).catch((e: unknown) =>
          toast.show({ title: tt('toast.notTorrent', { message: String(e) }), tone: 'danger', duration: 6000 }),
        )
      }),
      trackersIpc.onMagnet(({ target, sourceUrl }) => {
        showStatus({ kind: 'magnet', text: tt('trackers.interceptedMagnet') })
        openMagnetDialog(target, sourceUrl)
        void submitMagnet(target, tt('magnet.invalid'))
      }),
    ]
    return () => {
      for (const p of unlisteners) p.then((u) => u()).catch(report('trackers'))
    }
  }, [t, toast])

  useEffect(() => {
    const unlisten = playerIpc.onAutoplay(onAutoplayed)
    return () => {
      unlisten.then((u) => u()).catch(report('autoplay'))
    }
  }, [])
}
