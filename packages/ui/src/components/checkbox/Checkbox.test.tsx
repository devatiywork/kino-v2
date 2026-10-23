import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('переключается кликом и пробелом', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Checkbox onChange={onChange}>Peacemaker.S02E01.mkv</Checkbox>)
    const box = screen.getByRole('checkbox', { name: 'Peacemaker.S02E01.mkv' })
    await user.click(screen.getByText('Peacemaker.S02E01.mkv'))
    expect(onChange).toHaveBeenLastCalledWith(true)
    expect(box).toBeChecked()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('«выбрана часть» — для «выбрать все»', () => {
    render(<Checkbox isIndeterminate aria-label="Все файлы" />)
    const box = screen.getByRole('checkbox', { name: 'Все файлы' })
    expect(box).toHaveProperty('indeterminate', true)
    expect(box.closest('label')).toHaveAttribute('data-indeterminate')
  })
})
