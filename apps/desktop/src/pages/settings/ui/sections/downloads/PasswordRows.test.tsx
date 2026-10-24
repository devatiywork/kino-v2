import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@kino/ui'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../../../test/tauriMock')).createTauriMock())
vi.mock('../../../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { PasswordRows } = await import('./PasswordRows')
const { settingsStore } = await import('../../../../../entities/settings')
const { DEFAULT_SETTINGS } = await import('../../../../../shared/ipc/settings')
const mock = await tauri

function renderRows() {
  render(
    <ToastProvider>
      <PasswordRows />
    </ToastProvider>,
  )
  return userEvent.setup()
}

describe('PasswordRows (пароли сайтов в окне трекеров)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => settingsStore.set(DEFAULT_SETTINGS))
  })

  it('сохранение включено по умолчанию, выключение уходит в ядро', async () => {
    const user = renderRows()
    const toggle = screen.getByRole('switch', { name: 'Сохранять пароли сайтов' })
    expect(toggle).toBeChecked()
    await user.click(toggle)
    expect(mock.calls()).toEqual([['settings_update', { patch: { savePasswords: false } }]])
  })

  it('удаление — только после подтверждения', async () => {
    const user = renderRows()
    await user.click(screen.getByRole('button', { name: 'Удалить…' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Удалить сохранённые пароли?' })
    await user.click(screen.getByRole('button', { name: 'Оставить' }))
    await vi.waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(mock.calls()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Удалить…' }))
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(mock.calls()).toEqual([['tracker_clear_passwords', undefined]])
    expect(await screen.findByText('Сохранённые пароли удалены')).toBeInTheDocument()
  })
})
