import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { useMediaKeys } = await import('./useMediaKeys')
const { playbackStore, initialPlayback } = await import('../../../entities/playback')
const mock = await tauri

describe('useMediaKeys (ТЗ 6 «Медиаклавиши»)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => playbackStore.set({ ...initialPlayback, paused: false, duration: 100 }))
  })

  it('клавиши медиапанели Windows: пауза, следующая и предыдущая серия, стоп', async () => {
    const { unmount } = renderHook(useMediaKeys)
    act(() => mock.fire('media://key', 'togglePause'))
    act(() => mock.fire('media://key', 'next'))
    act(() => mock.fire('media://key', 'previous'))
    act(() => mock.fire('media://key', 'stop'))
    await vi.waitFor(() =>
      expect(mock.calls()).toEqual([
        ['player_set_paused', { paused: true }],
        ['player_open_neighbor', { step: 1 }],
        ['player_open_neighbor', { step: -1 }],
        ['player_set_paused', { paused: true }],
      ]),
    )
    unmount()
  })
})
