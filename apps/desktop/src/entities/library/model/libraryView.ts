import { createStore, useStore } from '../../../shared/lib/createStore'

interface LibraryViewState {
  /** «Все» or one shelf of «Библиотека»: 'series', 'films', a torrent category 'category:3' */
  shelf: string
}

/** The chosen shelf survives a series page and the player: «Назад» returns to it */
export const libraryView = createStore<LibraryViewState>({ shelf: 'all' })

export function chooseShelf(shelf: string): void {
  libraryView.set({ shelf })
}

export function useLibraryView<R>(selector: (state: LibraryViewState) => R): R {
  return useStore(libraryView, selector)
}
