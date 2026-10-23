import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { ResumeBanner } = await import('./ResumeBanner')
const { setResumed } = await import('../../../entities/playback')
const mock = await tauri

describe('ResumeBanner', () => {
  beforeEach(() => mock.reset())

  it('без позиции ничего не показывает', () => {
    act(() => setResumed(null))
    render(<ResumeBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('«Продолжено с 23:14», «Начать сначала» перематывает в начало', async () => {
    const user = userEvent.setup()
    act(() => setResumed(23 * 60 + 14))
    render(<ResumeBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Продолжено с 23:14')
    await user.click(screen.getByRole('button', { name: 'Начать сначала' }))
    expect(mock.calls()).toEqual([['player_seek', { seconds: 0, mode: 'absolute' }]])
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })
})
