import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)
const ipc = vi.hoisted(() => ({ startDragging: vi.fn(async () => undefined) }))
vi.mock('../../../shared/ipc/window', () => ({ windowIpc: ipc }))

const { MiniPlayer } = await import('./MiniPlayer')
const { playbackStore, initialPlayback } = await import('../../../entities/playback')
const mock = await tauri

const renderMini = () => {
  const onExpand = vi.fn()
  const onClose = vi.fn()
  render(<MiniPlayer onExpand={onExpand} onClose={onClose} />)
  return { onExpand, onClose, surface: screen.getByRole('region', { name: 'Мини-плеер' }) }
}

describe('MiniPlayer', () => {
  beforeEach(() => {
    mock.reset()
    vi.clearAllMocks()
    act(() => playbackStore.set({ ...initialPlayback, path: 'D:\\Film.mkv', idle: false, paused: false, duration: 100, position: 25 }))
  })

  it('клик по картинке — пауза, кнопки — развернуть и закрыть', async () => {
    const user = userEvent.setup()
    const { onExpand, onClose, surface } = renderMini()
    await user.click(surface)
    expect(mock.calls()).toContainEqual(['player_set_paused', { paused: true }])
    await user.click(screen.getByRole('button', { name: 'Развернуть плеер' }))
    expect(onExpand).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Закрыть плеер' }))
    expect(onClose).toHaveBeenCalledOnce()
    // the buttons do not pause on their way
    expect(mock.calls().filter(([c]) => c === 'player_set_paused')).toHaveLength(1)
  })

  it('двойной клик — обратно в большое окно', async () => {
    const user = userEvent.setup()
    const { onExpand, surface } = renderMini()
    await user.dblClick(surface)
    expect(onExpand).toHaveBeenCalledOnce()
    // the first click pauses, the second puts back what it found — not what the core says yet
    expect(mock.calls().filter(([c]) => c === 'player_set_paused')).toEqual([
      ['player_set_paused', { paused: true }],
      ['player_set_paused', { paused: false }],
    ])
  })

  it('потянули картинку — окно едет за мышью, паузы нет', () => {
    const { surface } = renderMini()
    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(surface, { clientX: 102, clientY: 101 })
    expect(ipc.startDragging).not.toHaveBeenCalled()
    fireEvent.pointerMove(surface, { clientX: 120, clientY: 110 })
    expect(ipc.startDragging).toHaveBeenCalledOnce()
    fireEvent.click(surface)
    expect(mock.calls().filter(([c]) => c === 'player_set_paused')).toEqual([])
  })
})
