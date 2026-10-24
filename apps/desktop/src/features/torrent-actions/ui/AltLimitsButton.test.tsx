import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { AltLimitsButton } = await import('./AltLimitsButton')
const { settingsStore } = await import('../../../entities/settings')
const { DEFAULT_SETTINGS } = await import('../../../shared/ipc/settings')
const mock = await tauri

describe('AltLimitsButton', () => {
  beforeEach(() => {
    mock.reset()
    act(() => settingsStore.set(DEFAULT_SETTINGS))
  })

  it('включает и выключает альтернативные лимиты, нажатое состояние — как в настройках', async () => {
    const user = userEvent.setup()
    render(<AltLimitsButton />)
    const button = screen.getByRole('button', { name: 'Альтернативные лимиты' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await user.click(button)
    expect(mock.calls()).toEqual([['settings_update', { patch: { altLimitsOn: true } }]])

    // The schedule turned them on: the core sends the settings
    act(() => settingsStore.set({ altLimitsOn: true }))
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await user.click(button)
    expect(mock.calls().at(-1)).toEqual(['settings_update', { patch: { altLimitsOn: false } }])
  })
})
