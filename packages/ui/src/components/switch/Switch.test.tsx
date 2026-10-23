import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('переключается кликом по подписи и сообщает новое значение', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch onChange={onChange}>Автовоспроизведение</Switch>)
    const control = screen.getByRole('switch', { name: 'Автовоспроизведение' })
    expect(control).not.toBeChecked()
    await user.click(screen.getByText('Автовоспроизведение'))
    expect(control).toBeChecked()
    expect(onChange).toHaveBeenLastCalledWith(true)
  })

  it('переключается пробелом с клавиатуры', async () => {
    const user = userEvent.setup()
    render(<Switch defaultSelected aria-label="Не засыпать" />)
    const control = screen.getByRole('switch', { name: 'Не засыпать' })
    await user.tab()
    await user.keyboard(' ')
    expect(control).not.toBeChecked()
  })

  it('управляемый режим: показывает переданное значение', () => {
    render(<Switch isSelected aria-label="История" />)
    expect(screen.getByRole('switch', { name: 'История' })).toBeChecked()
  })
})
