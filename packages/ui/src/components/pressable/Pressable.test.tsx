import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pressable } from './Pressable'

describe('Pressable', () => {
  it('ведёт себя как кнопка: мышь, Enter и Пробел', async () => {
    const user = userEvent.setup()
    const onPress = vi.fn()
    render(
      <Pressable aria-label="Продолжить «Клан Сопрано»" onPress={onPress}>
        <div>Клан Сопрано</div>
      </Pressable>,
    )
    const card = screen.getByRole('button', { name: 'Продолжить «Клан Сопрано»' })
    await user.click(card)
    card.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onPress).toHaveBeenCalledTimes(3)
  })

  it('отключённая поверхность не нажимается', async () => {
    const user = userEvent.setup()
    const onPress = vi.fn()
    render(
      <Pressable isDisabled onPress={onPress}>
        Файл удалён
      </Pressable>,
    )
    const card = screen.getByRole('button')
    await user.click(card)
    expect(onPress).not.toHaveBeenCalled()
    expect(card).toHaveAttribute('data-disabled')
  })
})
