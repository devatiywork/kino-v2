import { IconButton, IconClose, ScrollArea, Tabs } from '@kino/ui'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActiveTorrent } from '../../../shared/ipc/torrents'
import { useTorrentDetails } from '../model/useTorrentDetails'
import { FilesTab } from './FilesTab'
import { GeneralTab } from './GeneralTab'
import { PeersTab, TrackersTab } from './PeersTrackersTabs'

const MIN_HEIGHT = 180
const MAX_HEIGHT = 640
/** The panel keeps its height while the app runs */
let rememberedHeight = 320

/** The top edge: dragged with the mouse or moved with ↑/↓ */
function ResizeHandle({ height, onResize, label }: { height: number; onResize: (h: number) => void; label: string }) {
  const start = useRef<{ y: number; height: number } | null>(null)
  const clamp = (h: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h))
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    start.current = { y: e.clientY, height }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current) onResize(clamp(start.current.height + start.current.y - e.clientY))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      onResize(clamp(height + (e.key === 'ArrowUp' ? 24 : -24)))
    }
  }
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuemin={MIN_HEIGHT}
      aria-valuemax={MAX_HEIGHT}
      aria-valuenow={height}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (start.current = null)}
      onKeyDown={onKeyDown}
      className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize outline-none focus-visible:bg-accent/40 hover:bg-accent/25"
    />
  )
}

/** SPEC 4.3: details of the selected torrent at the bottom, like qBittorrent's properties panel */
export function TorrentDetailsPanel({ torrent, onClose }: { torrent: ActiveTorrent; onClose: () => void }) {
  const { t } = useTranslation('torrents')
  const { details, reload } = useTorrentDetails(torrent.id)
  const [height, setHeight] = useState(rememberedHeight)
  const resize = (h: number) => {
    rememberedHeight = h
    setHeight(h)
  }
  const tabs = [
    { id: 'general', label: t('details.general') },
    { id: 'files', label: t('details.files'), count: details?.files.length },
    { id: 'peers', label: t('details.peers'), count: details?.peers.length },
    { id: 'trackers', label: t('details.trackers'), count: details?.trackers.length },
  ]

  return (
    <section aria-label={t('details.label')} style={{ height }} className="relative flex shrink-0 flex-col border-t border-line bg-panel">
      <ResizeHandle height={height} onResize={resize} label={t('details.resize')} />
      <Tabs
        aria-label={t('details.label')}
        items={tabs}
        className="min-h-0 flex-1 gap-0 px-5 pt-3"
        panelClassName="min-h-0 flex-1"
        toolbar={
          <>
            <b className="min-w-0 flex-1 truncate text-sm font-medium text-fg-2">{torrent.name}</b>
            <IconButton label={t('details.close')} size="sm" onPress={onClose}>
              <IconClose size={15} />
            </IconButton>
          </>
        }
      >
        {(tab) => (
          <ScrollArea className="h-full" viewportClassName="py-3.5 pr-2">
            {tab.id === 'general' ? <GeneralTab torrent={torrent} details={details} /> : null}
            {tab.id === 'files' && details ? <FilesTab id={torrent.id} files={details.files} onChanged={reload} /> : null}
            {tab.id === 'peers' && details ? <PeersTab peers={details.peers} /> : null}
            {tab.id === 'trackers' && details ? <TrackersTab details={details} /> : null}
          </ScrollArea>
        )}
      </Tabs>
    </section>
  )
}
