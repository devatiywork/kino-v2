import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { UpdatesRow } = await import('./UpdatesRow')
const { settingsStore } = await import('../../../entities/settings')
const { DEFAULT_SETTINGS } = await import('../../../shared/ipc/settings')
const mock = await tauri

const release = { version: '0.22.0', url: 'https://github.com/devatiywork/kino-v2/releases/tag/v0.22.0', notes: '' }

describe('UpdatesRow (ТЗ 6 «Обновления»)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => settingsStore.set(DEFAULT_SETTINGS))
  })

  it('выключено по умолчанию; включение уходит в ядро', async () => {
    const user = userEvent.setup()
    render(<UpdatesRow />)
    const toggle = screen.getByRole('switch', { name: 'Проверять обновления' })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    expect(mock.calls()).toEqual([['settings_update', { patch: { checkUpdates: true } }]])
  })

  it('«Проверить сейчас»: вышла новая — кнопка ведёт на страницу версии', async () => {
    const user = userEvent.setup()
    mock.respond('app_check_update', { current: '0.21.0', latest: release, available: true })
    render(<UpdatesRow />)
    await user.click(screen.getByRole('button', { name: 'Проверить сейчас' }))
    expect(await screen.findByText('Вышла Kino 0.22.0')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Открыть страницу версии' }))
    expect(mock.calls().at(-1)).toEqual(['app_open_url', { url: release.url }])
  })

  it('последняя версия и ошибка сети — сказано словами', async () => {
    const user = userEvent.setup()
    mock.respond('app_check_update', { current: '0.22.0', latest: release, available: false })
    render(<UpdatesRow />)
    await user.click(screen.getByRole('button', { name: 'Проверить сейчас' }))
    expect(await screen.findByText('У вас последняя версия')).toBeInTheDocument()
    mock.invoke.mockImplementationOnce(async () => {
      throw 'error sending request'
    })
    await user.click(screen.getByRole('button', { name: 'Проверить сейчас' }))
    expect(await screen.findByText('Не удалось проверить: error sending request')).toBeInTheDocument()
  })
})
