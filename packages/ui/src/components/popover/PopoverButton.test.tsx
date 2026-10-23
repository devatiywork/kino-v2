import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconSubtitles } from '../../icons'
import { PopoverButton } from './PopoverButton'

describe('PopoverButton', () => {
  it('открывает окно-диалог с подписью и закрывает по Escape', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<PopoverButton label="Озвучка и субтитры" icon={<IconSubtitles />} content={<p>Дорожки</p>} onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: 'Озвучка и субтитры' }))
    expect(await screen.findByRole('dialog', { name: 'Озвучка и субтитры' })).toHaveTextContent('Дорожки')
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('содержимое может закрыть окно само', async () => {
    const user = userEvent.setup()
    render(
      <PopoverButton
        label="Скорость"
        content={(close) => (
          <button type="button" onClick={close}>
            Выбрать
          </button>
        )}
      >
        1.0×
      </PopoverButton>,
    )
    await user.click(screen.getByRole('button', { name: '1.0×' }))
    await user.click(await screen.findByRole('button', { name: 'Выбрать' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('кнопка показывает открытое состояние', async () => {
    const user = userEvent.setup()
    render(<PopoverButton label="Фильтр" icon={<IconSubtitles />} content="…" />)
    const button = screen.getByRole('button', { name: 'Фильтр' })
    expect(button).not.toHaveAttribute('data-selected')
    await user.click(button)
    expect(button).toHaveAttribute('data-selected')
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })
})
