import { ToastProvider } from '@kino/ui'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { libraryFile } from '../../../test/library'
import { seriesSummary } from '../../../test/series'
import { archiveEntry, categories } from '../../../test/torrents'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

const { LibraryPage } = await import('./LibraryPage')
const { libraryStore, libraryView } = await import('../../../entities/library')
const { torrentsStore } = await import('../../../entities/torrent')
const { routerStore } = await import('../../../shared/lib/router')
const mock = await tauri

const heat = libraryFile({ id: 5, path: 'D:\\Фильмы\\Heat.1995.mkv', title: 'Heat 1995', seriesTitle: null, season: null, episode: null, position: 0, duration: null })
const game = archiveEntry({ id: 21, name: 'Hollow Knight', categoryId: 2, status: 'inDownloads', contentPath: 'E:\\Игры\\Hollow Knight' })

const renderLibrary = () =>
  render(
    <ToastProvider>
      <LibraryPage />
    </ToastProvider>,
  )

describe('LibraryPage (integration)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => {
      libraryStore.set({ series: [seriesSummary()], films: [heat], folders: [{ id: 1, path: 'D:\\Медиатека', exists: true }], version: 1 })
      torrentsStore.set({ categories })
      libraryView.set({ shelf: 'all' })
      routerStore.set({ screen: 'library', previous: 'home', seriesKey: null })
    })
    mock.respond('app_library_torrents', [game])
  })

  it('«Все»: сериалы, фильмы и игры на диске — каждая полка со своим заголовком', async () => {
    renderLibrary()
    expect(await screen.findByRole('heading', { level: 2, name: 'Игры' })).toBeInTheDocument()
    const names = within(screen.getByRole('group', { name: 'Разделы библиотеки' }))
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(names).toEqual(['Все3', 'Сериалы1', 'Фильмы1', 'Игры1'])
    expect(screen.getByRole('button', { name: 'Kino Test, Сезон 1 · 1 из 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Heat 1995, Не смотрели' })).toBeInTheDocument()
    expect(screen.getByText('Hollow Knight')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Папки медиатеки' })).toBeInTheDocument()
    expect(mock.calls()).toContainEqual(['app_library_torrents', undefined])
  })

  it('чип «Игры» — только игры, папки медиатеки не мешают; «Открыть папку» открывает игру', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await user.click(await screen.findByRole('button', { name: /^Игры/ }))
    expect(screen.getByRole('button', { name: /^Игры/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    expect(screen.queryByText('Heat 1995')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Папки медиатеки' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Открыть папку' }))
    expect(mock.calls()).toContainEqual(['app_reveal_path', { path: 'E:\\Игры\\Hollow Knight' }])
  })

  it('фильм открывается в плеере', async () => {
    const user = userEvent.setup()
    mock.respond('player_open', { resumedFrom: null })
    renderLibrary()
    await user.click(screen.getByRole('button', { name: /^Фильмы/ }))
    await user.click(screen.getByRole('button', { name: 'Heat 1995, Не смотрели' }))
    await waitFor(() => expect(routerStore.get().screen).toBe('player'))
    expect(mock.calls()).toContainEqual(['player_open', { path: 'D:\\Фильмы\\Heat.1995.mkv' }])
  })

  it('пустая библиотека — подсказка, а пустая полка фильмов — своя', async () => {
    const user = userEvent.setup()
    mock.respond('app_library_torrents', [])
    act(() => libraryStore.set({ series: [], films: [], folders: [] }))
    renderLibrary()
    expect(screen.getByText(/Добавьте папку с сериалами и фильмами/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Фильмы/ }))
    expect(screen.getByText(/Здесь будут фильмы/)).toBeInTheDocument()
  })
})
