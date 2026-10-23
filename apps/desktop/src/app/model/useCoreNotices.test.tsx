import { ToastProvider } from '@kino/ui'
import { act, renderHook } from '@testing-library/react'
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

  it('.torrent с трекера — в окно добавления вместе со страницей раздачи', async () => {
    renderHook(useCoreNotices, { wrapper })
    mock.respond('torrent_preview', preview())
    act(() => mock.fire('trackers://torrent', { target: 'C:\\Kino\\trackers\\downloads\\1-shogun.torrent', sourceUrl: topic }))
    expect(trackersStore.get().status).toEqual({ kind: 'torrent', text: 'Kino перехватил .torrent — в «Загрузки» Windows ничего не сохранено' })
    await vi.waitFor(() => expect(addTorrentStore.get()).toMatchObject({ origin: 'tracker', sourceUrl: topic, preview: { name: 'Shogun.S01.2160p' } }))
    expect(mock.calls()).toEqual([['torrent_preview', { source: { kind: 'file', path: 'C:\\Kino\\trackers\\downloads\\1-shogun.torrent' } }]])
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

  it('ссылка на другой сайт — открыта в браузере, строка говорит куда', () => {
    renderHook(useCoreNotices, { wrapper })
    act(() => mock.fire('trackers://external', { url: 'https://kinopoisk.ru/film/1' }))
    expect(trackersStore.get().status).toEqual({ kind: 'external', text: 'Другой сайт открыт в браузере: kinopoisk.ru' })
  })
})
