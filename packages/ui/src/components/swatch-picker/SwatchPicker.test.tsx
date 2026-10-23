import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SwatchPicker } from './SwatchPicker'

const options = [
  { value: 'ember', label: 'Оранжевый', color: 'var(--kino-accent-ember)' },
  { value: 'teal', label: 'Бирюзовый', color: 'var(--kino-accent-teal)' },
  { value: 'violet', label: 'Сиреневый', color: 'var(--kino-accent-violet)' },
] as const

describe('SwatchPicker', () => {
  it('рисует радиогруппу образцов с названиями цветов', () => {
    render(<SwatchPicker aria-label="Акцентный цвет" options={options} value="ember" />)
    expect(screen.getByRole('radiogroup', { name: 'Акцентный цвет' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Оранжевый' })).toBeChecked()
  })

  it('цвет образца берётся из токена', () => {
    render(<SwatchPicker aria-label="Акцентный цвет" options={options} value="ember" />)
    const swatch = screen.getByRole('radio', { name: 'Бирюзовый' }).closest('label')
    expect(swatch?.style.getPropertyValue('--swatch')).toBe('var(--kino-accent-teal)')
  })

  it('выбор кликом и стрелками', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SwatchPicker aria-label="Акцентный цвет" options={options} defaultValue="ember" onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: 'Бирюзовый' }))
    expect(onChange).toHaveBeenLastCalledWith('teal')
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('violet')
  })
})
