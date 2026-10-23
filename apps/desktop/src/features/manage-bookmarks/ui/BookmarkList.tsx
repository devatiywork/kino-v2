import { cn, ConfirmDialog, IconLock, IconMore, IconPlus, MenuButton, Pressable } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { refreshBookmarks, useTrackers } from '../../../entities/tracker'
import { useCoverNativeLayer } from '../../../shared/lib/nativeLayer'
import { trackersIpc, type Bookmark } from '../../../shared/ipc/trackers'
import { BookmarkDialog } from './BookmarkDialog'

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch (e: unknown) {
    console.warn('[trackers] bookmark address', url, e)
    return url
  }
}

/**
 * SPEC 4.5: the trackers' bookmarks — a click opens the site; the «…» menu edits, moves and
 * deletes (it opens to the left, away from the site's page)
 */
export function BookmarkList({ onOpen }: { onOpen: (bookmark: Bookmark) => void }) {
  const { t, i18n } = useTranslation('torrents')
  const bookmarks = useTrackers((s) => s.bookmarks)
  const current = useTrackers((s) => s.current)
  const [editing, setEditing] = useState<Bookmark | null | undefined>(undefined)
  const [removing, setRemoving] = useState<Bookmark | null>(null)
  useCoverNativeLayer(removing != null)

  const run = (action: () => Promise<unknown>) =>
    action()
      .then(refreshBookmarks)
      .catch((e: unknown) => console.error('[trackers] bookmark', e))

  return (
    <nav aria-label={t('trackers.bookmarks')} className="flex w-[232px] shrink-0 flex-col gap-0.5 border-r border-line py-3 pr-3">
      <h2 className="px-2.5 pb-2 text-2xs font-semibold tracking-caps text-fg-3 uppercase">{t('trackers.bookmarksTitle')}</h2>
      <ul className="flex flex-col gap-0.5">
        {bookmarks.map((bookmark, index) => (
          <li key={bookmark.id} className="group flex items-center gap-0.5">
            <Pressable
              aria-current={current === bookmark.id || undefined}
              onPress={() => onOpen(bookmark)}
              className={cn(
                'flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 text-left data-[hovered]:bg-hover',
                current === bookmark.id && 'bg-raise data-[hovered]:bg-raise',
              )}
            >
              <span aria-hidden="true" className="grid size-[26px] shrink-0 place-items-center rounded-sm bg-accent-soft font-mono text-xs font-bold text-accent-fg">
                {(bookmark.title.trim()[0] ?? '?').toLocaleUpperCase(i18n.language)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn('truncate text-base text-fg-2', current === bookmark.id && 'font-semibold text-fg')}>{bookmark.title}</span>
                <small className="truncate font-mono text-2xs text-fg-3">{hostOf(bookmark.url)}</small>
              </span>
            </Pressable>
            <MenuButton
              label={t('trackers.bookmarkMenu', { title: bookmark.title })}
              icon={<IconMore size={16} />}
              placement="bottom end"
              className="size-8"
              items={[
                { id: 'edit', label: t('trackers.edit') },
                { id: 'up', label: t('trackers.up'), isDisabled: index === 0 },
                { id: 'down', label: t('trackers.down'), isDisabled: index === bookmarks.length - 1 },
                { id: 'delete', label: t('trackers.delete'), tone: 'danger', separatorBefore: true },
              ]}
              onAction={(key) => {
                if (key === 'edit') setEditing(bookmark)
                if (key === 'up' || key === 'down') void run(() => trackersIpc.moveBookmark(bookmark.id, key === 'up' ? -1 : 1))
                if (key === 'delete') setRemoving(bookmark)
              }}
            />
          </li>
        ))}
      </ul>
      <Pressable
        onPress={() => setEditing(null)}
        className="mt-1 flex h-10 items-center gap-2.5 rounded-md px-2.5 text-base text-fg-3 data-[hovered]:bg-hover data-[hovered]:text-fg"
      >
        <IconPlus size={16} />
        {t('trackers.addBookmark')}
      </Pressable>
      <p className="mt-auto flex gap-2 rounded-md bg-hover p-3 text-xs leading-relaxed text-fg-3">
        <IconLock size={14} className="mt-0.5 shrink-0 text-accent-fg" />
        {t('trackers.note')}
      </p>
      <BookmarkDialog
        isOpen={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        bookmark={editing ?? null}
        onSaved={(saved) => editing === null && onOpen(saved)}
      />
      <ConfirmDialog
        isOpen={removing != null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('trackers.deleteTitle', { title: removing?.title ?? '' })}
        description={t('trackers.deleteText')}
        confirmLabel={t('trackers.deleteConfirm')}
        cancelLabel={i18n.t('actions.cancel', { ns: 'common' })}
        tone="danger"
        onConfirm={() => removing && void run(() => trackersIpc.deleteBookmark(removing.id))}
      />
    </nav>
  )
}
