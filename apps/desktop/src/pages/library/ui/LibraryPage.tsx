import { FilterChip, ScrollArea } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { chooseShelf, useLibrary, useLibraryView } from '../../../entities/library'
import { AddFolderButton, FolderList } from '../../../features/library-folders'
import { LibraryShelf, shelfSize, useShelves } from '../../../widgets/library-shelf'

/**
 * «Библиотека» (SPEC 3.3): series and films of the library folders and the downloads, the rest
 * of the downloads on disk by category; a chip above shows one shelf, «Все» — all in a row
 */
export function LibraryPage() {
  const { t } = useTranslation('library')
  const shelves = useShelves()
  const folders = useLibrary((s) => s.folders)
  const chosen = useLibraryView((s) => s.shelf)
  // A category whose torrents are gone (or not loaded yet) shows «Все»; the choice stays
  const current = shelves.find((s) => s.id === chosen) ?? null
  const total = shelves.reduce((sum, s) => sum + shelfSize(s), 0)
  const shown = current ? [current] : shelves.filter((s) => shelfSize(s) > 0)
  const video = !current || current.id === 'series' || current.id === 'films'

  return (
    <ScrollArea className="h-full" aria-label={t('libraryScreen')}>
      <div className="mx-auto flex max-w-[1560px] flex-col gap-5 px-8 pt-[26px] pb-12">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-display text-fg">{t('libraryScreen')}</h1>
          <span className="font-mono text-xs text-fg-3">{total}</span>
          <span className="flex-1" />
          <AddFolderButton />
        </div>
        <div role="group" aria-label={t('shelves')} className="flex flex-wrap items-center gap-2">
          <FilterChip label={t('shelf.all')} count={total} isSelected={!current} onPress={() => chooseShelf('all')} />
          {shelves.map((shelf) => (
            <FilterChip
              key={shelf.id}
              label={shelf.title}
              count={shelfSize(shelf)}
              isSelected={current?.id === shelf.id}
              onPress={() => chooseShelf(shelf.id)}
            />
          ))}
        </div>
        {video ? <FolderList folders={folders} /> : null}
        {shown.length ? (
          shown.map((shelf) => <LibraryShelf key={shelf.id} shelf={shelf} titled={!current} />)
        ) : (
          <p className="rounded-lg border border-dashed border-line-2 p-7 text-center text-base text-fg-3">{t('emptyLibrary')}</p>
        )}
      </div>
    </ScrollArea>
  )
}
