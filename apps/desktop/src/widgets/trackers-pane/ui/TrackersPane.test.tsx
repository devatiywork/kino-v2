import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { TrackersPane } = await import('./TrackersPane')
const { rememberBookmark, rememberedBookmark, showStatus, trackersStore } = await import('../../../entities/tracker')
const mock = await tauri

const bookmarks = [
  { id: 1, title: 'Рутрекер', url: 'https://rutracker.org/forum/index.php' },
  { id: 2, title: 'RuTor', url: 'https://rutor.info/' },
]
// jsdom lays nothing out: every place is the zero rectangle
const bounds = { x: 0, y: 0, width: 0, height: 0 }

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

const commands = (name: string) => mock.calls().filter(([command]) => command === name)

function renderPane() {
  const view = render(<TrackersPane />)
  return { ...view, user: userEvent.setup() }
}

describe('TrackersPane (integration)', () => {
  beforeEach(() => {
    mock.reset()
    localStorage.clear()
    act(() => trackersStore.set({ bookmarks, current: null, opened: false, page: { url: null, loading: false }, status: null, pending: null }))
    mock.respond('tracker_bookmarks', bookmarks)
  })

  it('до выбора трекера — подсказка; клик по закладке открывает сайт на месте вкладки и запоминает его', async () => {
    const { user } = renderPane()
    expect(screen.getByText(/Выберите трекер слева/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled()
    expect(commands('tracker_open')).toEqual([])
    expect(commands('tracker_layout')).toEqual([['tracker_layout', { bounds: null }]])

    await user.click(screen.getByRole('button', { name: /^RuTor/ }))
    expect(commands('tracker_open')).toEqual([['tracker_open', { url: 'https://rutor.info/', bounds }]])
    expect(trackersStore.get()).toMatchObject({ opened: true, current: 2 })
    expect(rememberedBookmark()).toBe(2)
    await vi.waitFor(() => expect(commands('tracker_layout').at(-1)).toEqual(['tracker_layout', { bounds }]))
    expect(screen.queryByText(/Выберите трекер слева/)).not.toBeInTheDocument()
  })

  it('вкладка открывается на трекере прошлого раза', async () => {
    rememberBookmark(1)
    renderPane()
    await vi.waitFor(() => expect(commands('tracker_open')).toEqual([['tracker_open', { url: 'https://rutracker.org/forum/index.php', bounds }]]))
    expect(trackersStore.get().current).toBe(1)
  })

  it('страница раздачи из загрузок открывается сразу, с закладкой её сайта', async () => {
    rememberBookmark(2)
    act(() => trackersStore.set({ pending: 'https://bt.rutracker.org/forum/viewtopic.php?t=6593218' }))
    renderPane()
    await vi.waitFor(() =>
      expect(commands('tracker_open')).toEqual([['tracker_open', { url: 'https://bt.rutracker.org/forum/viewtopic.php?t=6593218', bounds }]]),
    )
    expect(trackersStore.get()).toMatchObject({ pending: null, current: 1 })
  })

  it('кнопки браузера и адресная строка', async () => {
    const { user } = renderPane()
    await user.click(screen.getByRole('button', { name: /^RuTor/ }))
    act(() => trackersStore.set({ page: { url: 'https://rutor.info/torrent/1', loading: false } }))
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    await user.click(screen.getByRole('button', { name: 'Обновить страницу' }))
    expect(commands('tracker_go')).toEqual([
      ['tracker_go', { action: 'back' }],
      ['tracker_go', { action: 'reload' }],
    ])

    const address = screen.getByRole('textbox', { name: 'Адрес страницы' })
    expect(address).toHaveValue('https://rutor.info/torrent/1')
    await user.clear(address)
    await user.type(address, 'rutor.info/search/shogun{Enter}')
    expect(commands('tracker_open').at(-1)).toEqual(['tracker_open', { url: 'rutor.info/search/shogun', bounds }])
    expect(trackersStore.get().current).toBe(2)
  })

  it('диалог над вкладкой прячет страницу сайта, после — она снова на месте', async () => {
    const { user } = renderPane()
    await user.click(screen.getByRole('button', { name: /^RuTor/ }))
    await user.click(screen.getByRole('button', { name: 'Добавить трекер' }))
    await vi.waitFor(() => expect(commands('tracker_layout').at(-1)).toEqual(['tracker_layout', { bounds: null }]))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    await vi.waitFor(() => expect(commands('tracker_layout').at(-1)).toEqual(['tracker_layout', { bounds }]))
  })

  it('строка о перехвате — над страницей; ушли со вкладки — страница спрятана', async () => {
    const { user, unmount } = renderPane()
    await user.click(screen.getByRole('button', { name: /^RuTor/ }))
    act(() => showStatus({ kind: 'torrent', text: 'Kino перехватил .torrent — в «Загрузки» Windows ничего не сохранено' }))
    expect(screen.getByRole('status')).toHaveTextContent('Kino перехватил .torrent')
    unmount()
    expect(commands('tracker_layout').at(-1)).toEqual(['tracker_layout', { bounds: null }])
  })
})
