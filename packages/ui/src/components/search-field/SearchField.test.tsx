import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SearchField } from './SearchField'

describe('SearchField', () => {
  it('поле поиска с подписью и подсказкой сочетания, пока пусто', () => {
    render(<SearchField label="Поиск" placeholder="Поиск по истории" shortcut="Ctrl K" />)
    expect(screen.getByRole('searchbox', { name: 'Поиск' })).toHaveAttribute('placeholder', 'Поиск по истории')
    expect(screen.getByText('Ctrl K')).toBeInTheDocument()
  })

  it('крестик очищает текст, Escape тоже', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchField label="Поиск" shortcut="Ctrl K" onChange={onChange} />)
    const input = screen.getByRole('searchbox', { name: 'Поиск' })
    await user.type(input, 'Сёгун')
    expect(onChange).toHaveBeenLastCalledWith('Сёгун')
    expect(screen.queryByText('Ctrl K')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(input).toHaveValue('')
    await user.type(input, 'Дюна{Escape}')
    expect(input).toHaveValue('')
  })

  it('Enter отправляет запрос', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<SearchField label="Поиск" onSubmit={onSubmit} />)
    await user.type(screen.getByRole('searchbox'), 'Peacemaker{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('Peacemaker')
  })
})
