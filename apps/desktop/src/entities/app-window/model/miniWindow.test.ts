import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { enterMini, leaveMini, startMiniSync } = await import('./miniWindow')
const { windowStore } = await import('./windowState')
const { routerStore } = await import('../../../shared/lib/router')
const mock = await tauri

const commands = () => mock.calls().map(([command]) => command)

describe('мини-плеер: своё окно', () => {
  beforeEach(() => {
    mock.reset()
    windowStore.set({ maximized: false, fullscreen: false, mini: false })
    routerStore.set({ screen: 'home', previous: 'home', seriesKey: null })
  })

  it('видео уходит в окно мини-плеера по размеру кадра; второй раз — не открывается', async () => {
    await enterMini(1920, 800)
    expect(mock.calls()).toContainEqual(['player_enter_mini', { width: 1920, height: 800 }])
    expect(windowStore.get().mini).toBe(true)

    await enterMini(1920, 800)
    expect(commands().filter((c) => c === 'player_enter_mini')).toHaveLength(1)
  })

  it('ядро не открыло окно — мини-плеера нет', async () => {
    mock.invoke.mockRejectedValueOnce(new Error('no window'))
    await expect(enterMini(null, null)).rejects.toThrow('no window')
    expect(windowStore.get().mini).toBe(false)
  })

  it('«Развернуть» — снова экран плеера, полноэкранный, если был; «✕» — экран не меняется', async () => {
    const stop = startMiniSync()
    windowStore.set({ fullscreen: true })
    await enterMini(1920, 1080)
    // The main window is free: out of fullscreen
    expect(windowStore.get().fullscreen).toBe(false)

    await leaveMini(true)
    expect(mock.calls()).toContainEqual(['player_leave_mini', { expand: true }])
    act(() => mock.fire('player://mini-closed', { expand: true }))
    expect(windowStore.get().mini).toBe(false)
    expect(routerStore.get().screen).toBe('player')
    expect(windowStore.get().fullscreen).toBe(true)

    act(() => routerStore.set({ screen: 'downloads' }))
    await enterMini(1920, 1080)
    act(() => mock.fire('player://mini-closed', { expand: false }))
    expect(windowStore.get().mini).toBe(false)
    expect(routerStore.get().screen).toBe('downloads')
    stop()
  })
})
