import { cn, IconDownload, IconMagnet, IconWarning } from '@kino/ui'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { rememberedBookmark, trackersStore, useTrackers } from '../../../entities/tracker'
import { BookmarkList } from '../../../features/manage-bookmarks'
import { useNativeLayerCovered } from '../../../shared/lib/nativeLayer'
import { useTrackerLayout } from '../model/useTrackerLayout'
import { BrowserBar } from './BrowserBar'

const report = (e: unknown) => console.error('[trackers] open', e)

/**
 * SPEC 4.5 «Трекеры»: bookmarks on the left, the tracker's site on the right. The site is a
 * native webview laid over the place below the bar: it hides when a dialog opens over the tab
 */
export function TrackersPane() {
  const { t } = useTranslation('torrents')
  const host = useRef<HTMLDivElement>(null)
  const covered = useNativeLayerCovered()
  const opened = useTrackers((s) => s.opened)
  const status = useTrackers((s) => s.status)
  const bookmarks = useTrackers((s) => s.bookmarks)
  const pending = useTrackers((s) => s.pending)
  const open = useTrackerLayout(host, opened && !covered)
  // Something is on its way to the page: the last visit's site must not replace it
  const started = useRef(false)

  // A release page from the downloads, or the site of the last visit
  useEffect(() => {
    if (pending) {
      started.current = true
      trackersStore.set({ pending: null })
      void open(pending).catch(report)
      return
    }
    if (started.current || opened || !bookmarks.length) return
    const last = bookmarks.find((b) => b.id === rememberedBookmark())
    if (!last) return
    started.current = true
    void open(last.url, last).catch(report)
  }, [pending, opened, bookmarks, open])

  const StatusIcon = status?.kind === 'magnet' ? IconMagnet : status?.kind === 'refused' ? IconWarning : IconDownload

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex min-h-0 pl-3">
        <BookmarkList onOpen={(bookmark) => void open(bookmark.url, bookmark).catch(report)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <BrowserBar onNavigate={(url) => void open(url).catch(report)} />
        {status ? (
          <p
            role="status"
            className={cn('flex items-center gap-2.5 border-b border-line px-4 py-2 text-sm text-fg', status.kind === 'refused' ? 'bg-raise' : 'bg-accent-soft')}
          >
            <StatusIcon size={16} className={cn('shrink-0', status.kind === 'refused' ? 'text-fg-2' : 'text-accent-fg')} />
            {status.text}
          </p>
        ) : null}
        <div ref={host} className="relative min-h-0 flex-1 bg-bg">
          {!opened ? <p className="mx-auto mt-16 max-w-md px-6 text-center text-base leading-relaxed text-fg-2">{t('trackers.empty')}</p> : null}
        </div>
      </div>
    </div>
  )
}
