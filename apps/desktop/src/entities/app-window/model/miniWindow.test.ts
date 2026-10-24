import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipc = vi.hoisted(() => ({
  unmaximize: vi.fn(async () => undefined),
  maximize: vi.fn(async () => undefined),
  setFullscreen: vi.fn(async () => undefined),
  setAlwaysOnTop: vi.fn(async () => undefined),
  setMinSize: vi.fn(async () => undefined),
  bounds: vi.fn(async () => ({ x: 100, y: 80, width: 1600, height: 900 })),
  setBounds: vi.fn(async () => undefined),
  workArea: vi.fn(async () => ({ x: 0, y: 0, width: 2560, height: 1392, scale: 1.25 })),
}))
vi.mock('../../../shared/ipc/window', () => ({ windowIpc: ipc }))

const { enterMini, leaveMini, miniSize } = await import('./miniWindow')
const { windowStore } = await import('./windowState')

describe('мини-плеер: окно', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    windowStore.set({ maximized: false, fullscreen: false, mini: false })
  })

  it('размер — по кадру: 480 в ширину, высота по пропорции; неизвестный кадр — 16:9', () => {
    expect(miniSize(1920, 800)).toEqual({ width: 480, height: 200 })
    expect(miniSize(1920, 1080)).toEqual({ width: 480, height: 270 })
    expect(miniSize(null, null)).toEqual({ width: 480, height: 270 })
    // portrait: a square at most
    expect(miniSize(1080, 1920)).toEqual({ width: 480, height: 480 })
  })

  it('развёрнутое окно сжимается в правый нижний угол экрана, поверх остальных; возвращается как было', async () => {
    windowStore.set({ maximized: true })
    await enterMini(1920, 1080)
    expect(windowStore.get().mini).toBe(true)
    expect(ipc.unmaximize).toHaveBeenCalled()
    expect(ipc.setMinSize).toHaveBeenCalledWith(256, 144)
    // 480×270 CSS at 125%: 600×338, 30 px from the work area's corner
    expect(ipc.setBounds).toHaveBeenCalledWith({ x: 2560 - 600 - 30, y: 1392 - 338 - 30, width: 600, height: 338 })
    expect(ipc.setAlwaysOnTop).toHaveBeenCalledWith(true)

    await enterMini(1920, 1080)
    expect(ipc.setBounds).toHaveBeenCalledTimes(1)

    await leaveMini()
    expect(windowStore.get().mini).toBe(false)
    expect(ipc.setAlwaysOnTop).toHaveBeenLastCalledWith(false)
    expect(ipc.setMinSize).toHaveBeenLastCalledWith(960, 600)
    expect(ipc.setBounds).toHaveBeenLastCalledWith({ x: 100, y: 80, width: 1600, height: 900 })
    expect(ipc.maximize).toHaveBeenCalled()
  })

  it('из полноэкранного — обратно в полноэкранный', async () => {
    windowStore.set({ fullscreen: true })
    await enterMini(null, null)
    expect(ipc.setFullscreen).toHaveBeenCalledWith(false)
    await leaveMini()
    expect(ipc.setFullscreen).toHaveBeenLastCalledWith(true)
    expect(windowStore.get().fullscreen).toBe(true)
  })
})
