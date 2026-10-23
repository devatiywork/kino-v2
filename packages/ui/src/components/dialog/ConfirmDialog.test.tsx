import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../button/Button'
import { ConfirmDialog } from './ConfirmDialog'

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onPress={() => setOpen(true)}>Очистить историю</Button>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Очистить историю?"
        description="Позиции и запомненные дорожки удалятся."
        confirmLabel="Очистить"
        tone="danger"
        onConfirm={onConfirm}
      />
    </>
  )
}

describe('ConfirmDialog', () => {
  it('открывается как alertdialog, фокус на «Отмене»', async () => {
    const user = userEvent.setup()
    render(<Harness onConfirm={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Очистить историю' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Очистить историю?' })
    expect(dialog).toHaveTextContent('Позиции и запомненные дорожки удалятся.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus())
  })

  it('подтверждение вызывает действие и закрывает окно', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Очистить историю' }))
    await user.click(await screen.findByRole('button', { name: 'Очистить' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('Escape и «Отмена» закрывают без действия', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Очистить историю' }))
    await screen.findByRole('alertdialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Очистить историю' }))
    await user.click(await screen.findByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
