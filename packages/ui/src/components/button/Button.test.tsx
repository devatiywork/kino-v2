import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('вызывает onPress по клику', async () => {
    const user = userEvent.setup()
    const onPress = vi.fn()
    render(<Button onPress={onPress}>Открыть</Button>)
    await user.click(screen.getByRole('button', { name: 'Открыть' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('нажимается с клавиатуры: Enter и пробел', async () => {
    const user = userEvent.setup()
    const onPress = vi.fn()
    render(<Button onPress={onPress}>Открыть</Button>)
    await user.tab()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onPress).toHaveBeenCalledTimes(2)
  })

  it('в отключённом состоянии не реагирует и помечен data-disabled', async () => {
    const user = userEvent.setup()
    const onPress = vi.fn()
    render(
      <Button onPress={onPress} isDisabled>
        Открыть
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Открыть' })
    await user.click(button)
    expect(onPress).not.toHaveBeenCalled()
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('data-disabled')
  })

  it('кольцо фокуса появляется только при навигации с клавиатуры', async () => {
    const user = userEvent.setup()
    render(<Button>Открыть</Button>)
    const button = screen.getByRole('button', { name: 'Открыть' })
    await user.click(button)
    expect(button).not.toHaveAttribute('data-focus-visible')
    await user.tab()
    await user.tab({ shift: true })
    expect(button).toHaveAttribute('data-focus-visible')
  })

  it('рисует иконку перед текстом и принимает дополнительный className', () => {
    render(
      <Button icon={<svg data-testid="icon" />} className="w-40">
        Открыть
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Открыть' })
    expect(button.firstChild).toBe(screen.getByTestId('icon'))
    expect(button.className).toContain('w-40')
  })
})
