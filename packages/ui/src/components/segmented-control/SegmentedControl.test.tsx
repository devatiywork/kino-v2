import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

const options = [
  { value: 'ask', label: 'Кнопка' },
  { value: 'auto', label: 'Пропускать' },
  { value: 'off', label: 'Не трогать' },
] as const

describe('SegmentedControl', () => {
  it('рисует радиогруппу с вариантами', () => {
    render(<SegmentedControl aria-label="Заставка" options={options} defaultValue="ask" />)
    expect(screen.getByRole('radiogroup', { name: 'Заставка' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Кнопка' })).toBeChecked()
  })

  it('выбирает вариант кликом', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SegmentedControl aria-label="Заставка" options={options} defaultValue="ask" onChange={onChange} />)
    await user.click(screen.getByText('Пропускать'))
    expect(onChange).toHaveBeenCalledWith('auto')
    expect(screen.getByRole('radio', { name: 'Пропускать' })).toBeChecked()
  })

  it('стрелки переключают выбор', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SegmentedControl aria-label="Заставка" options={options} defaultValue="ask" onChange={onChange} />)
    await user.tab()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('auto')
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('off')
  })
})
