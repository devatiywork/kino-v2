import { IconArrowDown, IconArrowUp, ScrollArea, Tabs } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { downloadsView, useDownloadsView, useTorrents, type DownloadsTab } from '../../../entities/torrent'
import { AddTorrentButtons } from '../../../features/add-torrent'
import { CategoryBar } from '../../../features/manage-categories'
import { AltLimitsButton, PauseAllButton } from '../../../features/torrent-actions'
import { formatRate } from '../../../shared/lib/formatBytes'
import { ArchiveList } from '../../../widgets/archive-list'
import { DownloadsList } from '../../../widgets/downloads-list'
import { TorrentDetailsPanel } from '../../../widgets/torrent-details'
import { TrackersPane } from '../../../widgets/trackers-pane'
import { useMagnetPaste } from '../model/useMagnetPaste'

/** Total speeds of all downloads */
function Speeds() {
  const { t, i18n } = useTranslation('torrents')
  const down = useTorrents((s) => s.downloadSpeed)
  const up = useTorrents((s) => s.uploadSpeed)
  return (
    <span className="flex items-center gap-3 font-mono text-xs text-fg-2">
      <span aria-label={t('totalDown', { rate: formatRate(down, i18n.language) })} className="flex items-center gap-1">
        <IconArrowDown size={13} />
        {formatRate(down, i18n.language)}
      </span>
      <span aria-label={t('totalUp', { rate: formatRate(up, i18n.language) })} className="flex items-center gap-1">
        <IconArrowUp size={13} />
        {formatRate(up, i18n.language)}
      </span>
    </span>
  )
}

/** SPEC 2, 4: «Загрузки» — the downloads and the archive; the details of a torrent at the bottom */
export function DownloadsPage() {
  const { t } = useTranslation('torrents')
  const tab = useDownloadsView((s) => s.tab)
  const selectedId = useDownloadsView((s) => s.selected)
  const active = useTorrents((s) => s.active)
  const archive = useTorrents((s) => s.archive)
  const archiveCount = useTorrents((s) => s.archiveCount)
  const selected = tab === 'downloads' ? active.find((torrent) => torrent.id === selectedId) : undefined
  useMagnetPaste()

  const tabs = [
    { id: 'downloads', label: t('tabs.downloads'), count: active.length },
    { id: 'archive', label: t('tabs.archive'), count: archiveCount },
    { id: 'trackers', label: t('tabs.trackers') },
  ]

  return (
    <div className="flex h-full flex-col">
      <Tabs
        aria-label={t('tabs.label')}
        items={tabs}
        selectedKey={tab}
        onSelectionChange={(key) => downloadsView.set({ tab: key as DownloadsTab, highlight: null })}
        className="min-h-0 flex-1 gap-3.5 px-8 pt-[22px] pb-0 [&>[role=tabpanel]]:pb-5"
        panelClassName="flex min-h-0 flex-1 flex-col gap-3"
        toolbar={
          <>
            <Speeds />
            <span className="flex-1" />
            <AltLimitsButton />
            <PauseAllButton />
            <AddTorrentButtons />
          </>
        }
      >
        {(item) =>
          item.id === 'trackers' ? (
            <TrackersPane />
          ) : (
            <>
              <CategoryBar items={item.id === 'downloads' ? active : archive} />
              <ScrollArea className="min-h-0 flex-1" viewportClassName="pb-6" aria-label={item.label}>
                {item.id === 'downloads' ? <DownloadsList /> : <ArchiveList />}
              </ScrollArea>
            </>
          )
        }
      </Tabs>
      {selected ? <TorrentDetailsPanel torrent={selected} onClose={() => downloadsView.set({ selected: null })} /> : null}
    </div>
  )
}
