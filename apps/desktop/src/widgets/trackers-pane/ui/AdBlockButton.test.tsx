import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { AdBlockButton } = await import('./AdBlockButton')
const { settingsStore } = await import('../../../entities/settings')
const { trackersStore } = await import('../../../entities/tracker')
const { DEFAULT_SETTINGS } = await import('../../../shared/ipc/settings')
const mock = await tauri

describe('AdBlockButton (блокировка рекламы на трекерах)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => {
      settingsStore.set(DEFAULT_SETTINGS)
      trackersStore.set({ opened: true, page: { url: 'https://rutracker.org/forum/index.php', loading: false, canGoBack: false, canGoForward: false, blockedAds: 14 } })
    })
  })

  it('включена по умолчанию и показывает, сколько рекламы остановлено на странице', () => {
    render(<AdBlockButton />)
    const button = screen.getByRole('button', { name: 'Блокировать рекламу' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('14')
  })

  it('выключение уходит в настройки и перезагружает страницу без блокировки', async () => {
    const user = userEvent.setup()
    render(<AdBlockButton />)
    await user.click(screen.getByRole('button', { name: 'Блокировать рекламу' }))
    await vi.waitFor(() =>
      expect(mock.calls()).toEqual([
        ['settings_update', { patch: { blockAds: false } }],
        ['tracker_go', { action: 'reload' }],
      ]),
    )
    act(() => settingsStore.set({ blockAds: false }))
    expect(screen.getByRole('button', { name: 'Блокировать рекламу' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Блокировать рекламу' })).not.toHaveTextContent('14')
  })
})
