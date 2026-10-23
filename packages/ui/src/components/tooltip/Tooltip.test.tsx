import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { IconPin, IconSettings } from '../../icons'
import { IconButton } from '../icon-button/IconButton'

describe('подсказки', () => {
  it('кнопка-иконка показывает свою подпись при фокусе с клавиатуры, без атрибута title', async () => {
    const user = userEvent.setup()
    render(
      <IconButton label="Настройки" shortcut="Ctrl ,">
        <IconSettings />
      </IconButton>,
    )
    const button = screen.getByRole('button', { name: 'Настройки' })
    expect(button).not.toHaveAttribute('title')
    await user.tab()
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Настройки')
    expect(tooltip).toHaveTextContent('Ctrl ,')
    // Подсказка повторяет подпись — второй раз скринридеру её не читаем
    expect(button).not.toHaveAttribute('aria-describedby')
  })

  it('своя подсказка, отличная от подписи, связана через aria-describedby', async () => {
    const user = userEvent.setup()
    render(
      <IconButton label="Поверх всех окон" tooltip="Окно останется над другими программами">
        <IconPin />
      </IconButton>,
    )
    await user.tab()
    const tooltip = await screen.findByRole('tooltip')
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', tooltip.id)
  })

  it('tooltip={false} отключает подсказку', async () => {
    const user = userEvent.setup()
    render(
      <IconButton label="Закрыть" tooltip={false}>
        <IconPin />
      </IconButton>,
    )
    await user.tab()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
