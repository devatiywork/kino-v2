import { ToastProvider } from '@kino/ui'
import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { historyEntry, libraryFile } from '../../../test/library'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

const { HomePage } = await import('./HomePage')
const { libraryStore } = await import('../../../entities/library')

const renderHome = () =>
  render(
    <ToastProvider>
      <HomePage />
    </ToastProvider>,
  )

describe('HomePage', () => {
  beforeEach(() => libraryStore.set({ continueWatching: [], history: [], loaded: true }))

  it('ничего не смотрели — экран первого запуска', () => {
    renderHome()
    expect(screen.getByRole('button', { name: /Открыть файл/ })).toBeInTheDocument()
  })

  it('«Продолжить» с последней остановки, история по дням и «Не досмотрено»', () => {
    const e5 = libraryFile({ id: 5, position: 23 * 60 + 14, thumb: 'C:\\data\\thumbs\\5.jpg' })
    const film = libraryFile({ id: 9, seriesTitle: null, season: null, episode: null, title: 'Interstellar 2014', duration: 10_140, position: 4000 })
    act(() =>
      libraryStore.set({
        continueWatching: [e5, film],
        history: [historyEntry(2, new Date(), e5), historyEntry(1, new Date(), libraryFile({ id: 4 }), { watched: true, position: 3500 })],
        loaded: true,
      }),
    )
    renderHome()

    expect(screen.getByRole('heading', { level: 1, name: 'The Sopranos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Продолжить с 23:14' })).toBeInTheDocument()
    expect(screen.getByText('Сезон 1 · Серия 5')).toBeInTheDocument()

    const today = screen.getByRole('region', { name: 'Сегодня' })
    expect(within(today).getByRole('button', { name: /The Sopranos · С1 · Е5, остановились на 23:14/ })).toBeInTheDocument()
    expect(within(today).getByRole('button', { name: /С1 · Е4, досмотрено/ })).toBeInTheDocument()

    // the hero is not repeated in the grid
    const grid = screen.getByRole('heading', { name: 'Не досмотрено' }).closest('section')
    if (!grid) throw new Error('grid')
    expect(within(grid).getAllByRole('button')).toHaveLength(1)
    expect(within(grid).getByText('Видео · 2 ч 49 мин')).toBeInTheDocument()

    const frame = document.querySelector('img')
    expect(frame?.getAttribute('src')).toContain(encodeURIComponent('C:\\data\\thumbs\\5.jpg'))
  })
})
