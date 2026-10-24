import { ToastProvider } from '@kino/ui'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../test/tauriMock')).createTauriMock())
vi.mock('../../shared/ipc/bridge', async () => (await tauri).bridge)

const { useAppStartup } = await import('./useAppStartup')
const { addTorrentStore } = await import('../../features/add-torrent')
const { preview } = await import('../../test/torrents')
const mock = await tauri

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>

describe('useAppStartup: Kino запустили ещё раз (ТЗ 6 «Одно окно»)', () => {
  beforeEach(() => {
    mock.reset()
    mock.respond('app_launch_files', [])
    act(() => addTorrentStore.set({ preview: null }))
  })

  it('видео второго запуска открывается в этом окне', async () => {
    renderHook(useAppStartup, { wrapper })
    act(() => mock.fire('app://open', ['D:\\Сериалы\\Shogun.S01E01.mkv']))
    await vi.waitFor(() => expect(mock.calls()).toContainEqual(['player_open', { path: 'D:\\Сериалы\\Shogun.S01E01.mkv' }]))
  })

  it('.torrent второго запуска — в окно добавления', async () => {
    mock.respond('torrent_preview', preview())
    renderHook(useAppStartup, { wrapper })
    act(() => mock.fire('app://open', ['C:\\Downloads\\shogun.torrent']))
    await vi.waitFor(() => expect(addTorrentStore.get().preview?.name).toBe('Shogun.S01.2160p'))
    expect(mock.calls()).toContainEqual(['torrent_preview', { source: { kind: 'file', path: 'C:\\Downloads\\shogun.torrent' } }])
  })
})
