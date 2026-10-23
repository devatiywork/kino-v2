import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Slider } from './Slider'

describe('Slider', () => {
  it('доступен как слайдер с подписью и текущим значением', () => {
    render(<Slider label="Громкость" defaultValue={80} maxValue={130} />)
    const slider = screen.getByRole('slider', { name: 'Громкость' })
    expect(slider).toHaveValue('80')
  })

  it('стрелки меняют значение на шаг', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Slider label="Громкость" defaultValue={80} maxValue={130} step={5} onChange={onChange} />)
    await user.tab()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith(85)
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith(75)
  })

  it('не выходит за границы', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Slider label="Громкость" defaultValue={130} maxValue={130} onChange={onChange} />)
    await user.tab()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('slider')).toHaveValue('130')
  })

  it('показывает значение с форматированием', () => {
    render(<Slider label="Громкость" defaultValue={80} showValue formatOptions={{ style: 'unit', unit: 'percent' }} />)
    expect(screen.getByText(/80/)).toBeInTheDocument()
  })
})
