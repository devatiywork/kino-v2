import { Button, IconDownload, IconPlay } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { categoryName, downloadsView, matchesCategory, TorrentRow, useDownloadsView, useTorrents } from '../../../entities/torrent'
import { useOpenVideo } from '../../../features/open-video'
import { TorrentActions } from '../../../features/torrent-actions'

/** SPEC 4.3: the torrents in the downloads, filtered by category; «Смотреть» opens a ready video */
export function DownloadsList() {
  const { t } = useTranslation('torrents')
  const torrents = useTorrents((s) => s.active)
  const categories = useTorrents((s) => s.categories)
  const filter = useDownloadsView((s) => s.category)
  const selected = useDownloadsView((s) => s.selected)
  const { openPath } = useOpenVideo()
  const shown = torrents.filter((torrent) => matchesCategory(filter, torrent.categoryId))

  if (!shown.length) {
    return (
      <div className="grid h-full place-items-center p-10">
        <div className="flex max-w-md flex-col items-center gap-2 text-center text-fg-2">
          <IconDownload size={28} className="text-fg-3" />
          <b className="text-md font-medium text-fg">{t('emptyDownloads')}</b>
          <span className="text-sm">{t('emptyDownloadsHint')}</span>
        </div>
      </div>
    )
  }

  return (
    <ul aria-label={t('tabs.downloads')} className="flex flex-col gap-2">
      {shown.map((torrent) => (
        <li key={torrent.id}>
          <TorrentRow
            torrent={torrent}
            category={categoryName(torrent.categoryId, categories, t)}
            selected={selected === torrent.id}
            onSelect={() => downloadsView.set({ selected: selected === torrent.id ? null : torrent.id })}
            actions={
              <>
                {torrent.video ? (
                  <Button variant="ghost" size="sm" icon={<IconPlay size={14} />} onPress={() => void openPath(torrent.video ?? '')}>
                    {t('watch')}
                  </Button>
                ) : null}
                <TorrentActions torrent={torrent} />
              </>
            }
          />
        </li>
      ))}
    </ul>
  )
}
