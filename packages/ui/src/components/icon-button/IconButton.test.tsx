import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconPin } from '../../icons'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('доступна по подписи из label', () => {
    render(
      <IconButton label="Поверх всех окон">
        <IconPin />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Поверх всех окон' })).toBeInTheDocument()
  })

  it('включённое состояние отражается в aria-pressed и data-selected', () => {
    render(
      <IconButton label="Поверх всех окон" isSelected>
        <IconPin />
      </IconButton>,
    )
    const button = screen.getByRole('button', { name: 'Поверх всех окон' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveAttribute('data-selected')
  })

  it('вызывает onPress', async () => {
    const user = userEvent.setup()
    const onPress = vi.fn()
    render(
      <IconButton label="Закрепить" onPress={onPress}>
        <IconPin />
      </IconButton>,
    )
    await user.click(screen.getByRole('button', { name: 'Закрепить' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
