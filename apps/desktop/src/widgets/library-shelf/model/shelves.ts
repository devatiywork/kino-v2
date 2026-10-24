import type { LibraryFile, SeriesSummary } from '../../../shared/ipc/library'
import type { ArchiveEntry, Category } from '../../../shared/ipc/torrents'

/** A shelf of «Библиотека», one chip above the page */
export interface Shelf {
  /** 'series', 'films' or a torrent category: 'category:3', 'category:none' */
  id: string
  title: string
  series: SeriesSummary[]
  films: LibraryFile[]
  /** Finished torrents on disk that are not videos of the library: games, programs… */
  torrents: ArchiveEntry[]
}

export interface ShelfInput {
  series: SeriesSummary[]
  films: LibraryFile[]
  torrents: ArchiveEntry[]
  categories: readonly Category[]
  /** In the language of the window */
  titles: { series: string; films: string; noCategory: string }
}

/**
 * «Сериалы» and «Фильмы» always, then a shelf per torrent category that has something on disk,
 * in the categories' order, «Без категории» last. A category named like a video shelf
 * («Сериалы» is there by default) joins it instead of a twin chip
 */
export function buildShelves({ series, films, torrents, categories, titles }: ShelfInput): Shelf[] {
  const video: Shelf[] = [
    { id: 'series', title: titles.series, series, films: [], torrents: [] },
    { id: 'films', title: titles.films, series: [], films, torrents: [] },
  ]
  const known = new Set(categories.map((c) => c.id))
  const groups = [
    ...categories.map((c) => ({ id: `category:${c.id}`, categoryId: c.id as number | null, title: c.name })),
    { id: 'category:none', categoryId: null, title: titles.noCategory },
  ]
  const others: Shelf[] = []
  for (const group of groups) {
    const entries = torrents.filter((e) => (e.categoryId != null && known.has(e.categoryId) ? e.categoryId : null) === group.categoryId)
    if (!entries.length) continue
    const name = group.title.trim().toLocaleLowerCase()
    const twin = video.find((shelf) => shelf.title.toLocaleLowerCase() === name)
    if (twin) twin.torrents = [...twin.torrents, ...entries]
    else others.push({ id: group.id, title: group.title, series: [], films: [], torrents: entries })
  }
  return [...video, ...others]
}

export function shelfSize(shelf: Shelf): number {
  return shelf.series.length + shelf.films.length + shelf.torrents.length
}
