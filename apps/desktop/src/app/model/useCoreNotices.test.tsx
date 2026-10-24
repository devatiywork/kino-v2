import { ToastProvider } from '@kino/ui'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../test/tauriMock')).createTauriMock())
vi.mock('../../shared/ipc/bridge', async () => (await tauri).bridge)

const { useCoreNotices } = await import('./useCoreNotices')
const { addTorrentStore, submitMagnet } = await import('../../features/add-torrent')
const { trackersStore } = await import('../../entities/tracker')
const { preview } = await import('../../test/torrents')
const mock = await tauri

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>
/** The hook inside the toasts' provider, so a toast is on the screen */
function Notices() {
  useCoreNotices()
  return null
}
const magnet = 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=Shogun'
const topic = 'https://rutracker.org/forum/viewtopic.php?t=1'

describe('useCoreNotices: перехваты браузера трекеров', () => {
  beforeEach(() => {
    mock.reset()
    act(() => {
      addTorrentStore.set({ preview: null, origin: 'file', sourceUrl: null, magnetOpen: false, magnetText: '', resolving: false, magnetError: null })
      trackersStore.set({ status: null })
    })
  })

  it('вышла новая Kino — уведомление до закрытия, «Что нового» открывает страницу версии', async () => {
    const user = userEvent.setup()
    render(<Notices />, { wrapper })
    const url = 'https://github.com/devatiywork/kino-v2/releases/tag/v0.22.0'
    mock.respond('app_take_update', { version: '0.22.0', url, notes: '' })
    act(() => mock.fire('app://update', null))
    expect(await screen.findByText('Вышла Kino 0.22.0')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Что нового' }))
    expect(mock.calls().at(-1)).toEqual(['app_open_url', { url }])
  })

  it('не .torrent с трекера — не скачан, сказано почему; окно добавления не открывается', () => {
    renderHook(useCoreNotices, { wrapper })
    act(() => mock.fire('trackers://refused', { name: 'setup.exe' }))
    expect(trackersStore.get().status).toEqual({
      kind: 'refused',
      text: '«setup.exe» не скачан: здесь Kino сохраняет только .torrent. Нужен этот файл — «Открыть в браузере»',
    })
    expect(addTorrentStore.get().preview).toBeNull()
    expect(mock.calls().some(([command]) => command === 'torrent_preview')).toBe(false)
  })

  it('.torrent с трекера — в окно добавления вместе со страницей раздачи', async () => {
    renderHook(useCoreNotices, { wrapper })
    mock.respond('torrent_preview', preview())
    act(() => mock.fire('trackers://torrent', { target: 'C:\\Kino\\trackers\\downloads\\1-shogun.torrent', sourceUrl: topic }))
    expect(trackersStore.get().status).toEqual({ kind: 'torrent', text: 'Kino перехватил .torrent — в «Загрузки» Windows ничего не сохранено' })
    await vi.waitFor(() => expect(addTorrentStore.get()).toMatchObject({ origin: 'tracker', sourceUrl: topic, preview: { name: 'Shogun.S01.2160p' } }))
    expect(mock.calls().filter(([command]) => command === 'torrent_preview')).toEqual([
      ['torrent_preview', { source: { kind: 'file', path: 'C:\\Kino\\trackers\\downloads\\1-shogun.torrent' } }],
    ])
  })

  it('magnet с трекера — сразу спрашивает пиров; повтор из окна не теряет страницу раздачи', async () => {
    renderHook(useCoreNotices, { wrapper })
    mock.invoke.mockImplementationOnce(async () => {
      throw 'пиры не ответили'
    })
    act(() => mock.fire('trackers://magnet', { target: magnet, sourceUrl: topic }))
    expect(trackersStore.get().status?.kind).toBe('magnet')
    expect(addTorrentStore.get()).toMatchObject({ magnetOpen: true, magnetText: magnet })
    await vi.waitFor(() => expect(addTorrentStore.get().magnetError).toBe('пиры не ответили'))

    mock.respond('torrent_preview', preview())
    await act(() => submitMagnet(magnet, 'не magnet'))
    expect(addTorrentStore.get()).toMatchObject({ magnetOpen: false, origin: 'tracker', sourceUrl: topic })
  })
})

describe('useCoreNotices: окно ушло в трей', () => {
  it('видео остановлено: с экрана плеера — на прежний экран, из полноэкранного — в окно', async () => {
    const { routerStore } = await import('../../shared/lib/router')
    const { windowStore } = await import('../../entities/app-window')
    mock.reset()
    act(() => {
      routerStore.set({ screen: 'player', previous: 'library', seriesKey: null })
      windowStore.set({ maximized: false, fullscreen: true, mini: false })
    })
    renderHook(() => useCoreNotices(), { wrapper })
    act(() => mock.fire('app://to-tray', null))
    expect(routerStore.get().screen).toBe('library')
    expect(windowStore.get().fullscreen).toBe(false)
    expect(mock.calls().some(([command]) => command === 'plugin:window|set_fullscreen')).toBe(true)
  })
})
