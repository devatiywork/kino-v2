import { createStore, useStore } from '../../../shared/lib/createStore'

export type DownloadsTab = 'downloads' | 'archive'
/** 'all', a category id, or 'none' — «Без категории» */
export type CategoryFilter = 'all' | 'none' | number

interface DownloadsView {
  tab: DownloadsTab
  category: CategoryFilter
  /** The torrent whose details are open */
  selected: number | null
  sort: 'date' | 'name'
  /** A record to show in the archive (after «Показать в архиве») */
  highlight: number | null
}

/** What the downloads screen shows: kept while other screens are open */
export const downloadsView = createStore<DownloadsView>({ tab: 'downloads', category: 'all', selected: null, sort: 'date', highlight: null })

export function useDownloadsView<R>(selector: (state: DownloadsView) => R): R {
  return useStore(downloadsView, selector)
}

export const matchesCategory = (filter: CategoryFilter, categoryId: number | null): boolean =>
  filter === 'all' || (filter === 'none' ? categoryId == null : categoryId === filter)
