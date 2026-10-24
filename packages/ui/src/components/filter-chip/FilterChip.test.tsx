import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilterChip } from './FilterChip'

describe('FilterChip', () => {
  it('кнопка-переключатель с числом; нажатие выбирает', async () => {
    const user = userEvent.setup()
    const onPress = vi.fn()
    render(
      <>
        <FilterChip label="Все" count={42} isSelected onPress={() => undefined} />
        <FilterChip label="Сериалы" count={12} isSelected={false} onPress={onPress} />
      </>,
    )
    expect(screen.getByRole('button', { name: /Все/ })).toHaveAttribute('aria-pressed', 'true')
    const series = screen.getByRole('button', { name: /Сериалы/ })
    expect(series).toHaveAttribute('aria-pressed', 'false')
    expect(series).toHaveTextContent('Сериалы12')
    await user.click(series)
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('без числа — только название', () => {
    render(<FilterChip label="Игры" isSelected={false} onPress={() => undefined} />)
    expect(screen.getByRole('button')).toHaveTextContent(/^Игры$/)
  })
})
