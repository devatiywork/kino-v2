import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { useVideoLayer } = await import('./useVideoLayer')
const { windowStore } = await import('../../../entities/app-window')
const mock = await tauri

describe('useVideoLayer', () => {
  beforeEach(() => {
    mock.reset()
    act(() => windowStore.set({ maximized: false, fullscreen: false, mini: false }))
  })

  it('экран плеера показывает видео; пока играет мини-плеер — забирает его обратно в основное окно', () => {
    const first = renderHook(() => useVideoLayer())
    expect(mock.calls().map(([c]) => c)).toContain('player_set_video_visible')
    expect(mock.calls().map(([c]) => c)).not.toContain('player_leave_mini')
    first.unmount()

    act(() => windowStore.set({ mini: true }))
    renderHook(() => useVideoLayer())
    expect(mock.calls()).toContainEqual(['player_leave_mini', { expand: true }])
  })
})
