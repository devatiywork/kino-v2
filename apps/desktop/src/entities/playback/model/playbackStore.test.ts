import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { initialPlayback, playbackStore, startPlaybackSync } = await import('./playbackStore')
const mock = await tauri

describe('playback sync with the core (integration)', () => {
  beforeEach(() => {
    mock.reset()
    playbackStore.set(initialPlayback)
  })

  it('берёт текущее состояние и дальше следует за событиями ядра', async () => {
    mock.respond('player_snapshot', { ...initialPlayback, idle: false, path: 'D:\\a.mkv', duration: 120, position: 3 })
    const stop = startPlaybackSync()
    await vi.waitFor(() => expect(playbackStore.get().path).toBe('D:\\a.mkv'))
    expect(mock.listen.mock.calls.map(([event]) => event)).toEqual(['player://state', 'player://position'])

    mock.fire('player://position', 42.5)
    expect(playbackStore.get().position).toBe(42.5)

    mock.fire('player://state', { ...playbackStore.get(), paused: true, audioId: 2 })
    expect(playbackStore.get()).toMatchObject({ paused: true, audioId: 2, position: 42.5 })

    stop()
    await vi.waitFor(() => expect(mock.unlisten).toHaveBeenCalledTimes(2))
  })
})
