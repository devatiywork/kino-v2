import { useTranslation } from 'react-i18next'
import { FilmCard, SeriesCard } from '../../../entities/library'
import { useOpenVideo } from '../../../features/open-video'
import { openSeries } from '../../../shared/lib/router'
import { shelfSize, type Shelf } from '../model/shelves'
import { TorrentShelf } from './TorrentShelf'

/**
 * One shelf of «Библиотека»: series cards, film cards, rows of the torrents on disk. `titled` —
 * under «Все», where the shelves follow one another; a chosen shelf is named by its chip
 */
export function LibraryShelf({ shelf, titled }: { shelf: Shelf; titled: boolean }) {
  const { t } = useTranslation('library')
  const { openFile } = useOpenVideo()
  const size = shelfSize(shelf)

  return (
    <section aria-label={shelf.title} className="flex flex-col gap-4">
      {titled ? (
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-lg font-semibold tracking-display text-fg">{shelf.title}</h2>
          <span className="font-mono text-xs text-fg-3">{size}</span>
        </div>
      ) : null}
      {shelf.series.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
          {shelf.series.map((s) => (
            <SeriesCard key={s.key} series={s} onOpen={openSeries} />
          ))}
        </div>
      ) : null}
      {shelf.films.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-[18px]">
          {shelf.films.map((file) => (
            <FilmCard key={file.id} file={file} onOpen={(f) => void openFile(f)} />
          ))}
        </div>
      ) : null}
      {shelf.torrents.length ? <TorrentShelf entries={shelf.torrents} label={shelf.title} /> : null}
      {!size ? (
        <p className="rounded-lg border border-dashed border-line-2 p-7 text-center text-base text-fg-3">
          {shelf.id === 'films' ? t('noFilms') : t('noSeries')}
        </p>
      ) : null}
    </section>
  )
}
