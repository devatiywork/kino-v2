import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SOPRANOS_TRACKS } from '../../../test/tracks'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('@tauri-apps/api/core', async () => ({ invoke: (await tauri).invoke }))
vi.mock('@tauri-apps/api/event', async () => ({ listen: (await tauri).listen }))

const { TracksButton } = await import('./TracksButton')
const { initialPlayback, playbackStore } = await import('../../../entities/playback')
const mock = await tauri

describe('TracksButton (integration)', () => {
  beforeEach(() => {
    mock.reset()
    playbackStore.set({ ...initialPlayback, idle: false, tracks: SOPRANOS_TRACKS, audioId: 1, subtitleId: null })
  })

  it('на кнопке текущая озвучка, в окне — озвучка и субтитры с подробностями', async () => {
    const user = userEvent.setup()
    render(<TracksButton />)
    const button = screen.getByRole('button', { name: /Озвучка и субтитры/ })
    expect(button).toHaveTextContent('AVO Goblin')
    await user.click(button)

    const dialog = await screen.findByRole('dialog', { name: 'Озвучка и субтитры' })
    const audio = within(dialog).getByRole('listbox', { name: 'Озвучка' })
    expect(within(audio).getAllByRole('option')).toHaveLength(4)
    expect(within(audio).getByRole('option', { name: /Goblin/ })).toHaveAttribute('aria-selected', 'true')
    const subs = within(dialog).getByRole('listbox', { name: 'Субтитры' })
    expect(within(subs).getByRole('option', { name: /Выключены/ })).toHaveAttribute('aria-selected', 'true')
    expect(within(subs).getByRole('option', { name: /Английский/ })).toHaveTextContent('внешние')
  })

  it('выбор озвучки отправляет её id в ядро без перезагрузки видео', async () => {
    const user = userEvent.setup()
    render(<TracksButton />)
    await user.click(screen.getByRole('button', { name: /Озвучка и субтитры/ }))
    const audio = await screen.findByRole('listbox', { name: 'Озвучка' })
    await user.click(within(audio).getByRole('option', { name: /English/ }))
    await waitFor(() => expect(mock.calls()).toContainEqual(['player_set_audio', { id: 4 }]))
    expect(mock.calls().some(([command]) => command === 'player_open')).toBe(false)
  })
})
