import { ToastProvider } from '@kino/ui'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { ClearHistoryButton } = await import('./ClearHistoryButton')
const mock = await tauri

function renderButton() {
  render(
    <ToastProvider>
      <ClearHistoryButton />
    </ToastProvider>,
  )
  return userEvent.setup()
}

describe('ClearHistoryButton', () => {
  beforeEach(() => mock.reset())

  it('без подтверждения ничего не удаляется', async () => {
    const user = renderButton()
    await user.click(screen.getByRole('button', { name: 'Очистить' }))
    expect(screen.getByRole('alertdialog', { name: 'Очистить историю?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(mock.calls()).toEqual([])
  })

  it('после подтверждения история очищается', async () => {
    const user = renderButton()
    await user.click(screen.getByRole('button', { name: 'Очистить' }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(screen.getAllByRole('button', { name: 'Очистить' }).find((b) => dialog.contains(b)) ?? dialog)
    expect(mock.calls()).toEqual([['app_clear_history', undefined]])
    expect(await screen.findByText('История очищена')).toBeInTheDocument()
  })
})
