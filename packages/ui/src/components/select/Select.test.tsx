import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ListBox } from '../list-box/ListBox'
import { Select } from './Select'

const SPEEDS = [
  { id: '0.75', label: '0.75×' },
  { id: '1', label: '1.0×' },
  { id: '1.25', label: '1.25×' },
  { id: '2', label: '2.0×', isDisabled: true },
]

describe('Select', () => {
  it('показывает выбранное значение на кнопке', () => {
    render(<Select label="Скорость" items={SPEEDS} defaultSelectedKey="1" />)
    expect(screen.getByRole('button', { name: /1\.0×/ })).toBeInTheDocument()
  })

  it('открывается кликом: свой список с вариантами, отмеченным выбранным', async () => {
    const user = userEvent.setup()
    render(<Select label="Скорость" items={SPEEDS} defaultSelectedKey="1" />)
    await user.click(screen.getByRole('button', { name: /1\.0×/ }))
    const listbox = await screen.findByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(4)
    expect(within(listbox).getByRole('option', { name: '1.0×' })).toHaveAttribute('aria-selected', 'true')
    expect(within(listbox).getByRole('option', { name: '2.0×' })).toHaveAttribute('aria-disabled', 'true')
    expect(document.querySelector('select')).toBeNull()
  })

  it('выбор пункта сообщает ключ и закрывает список', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    render(<Select label="Скорость" items={SPEEDS} defaultSelectedKey="1" onSelectionChange={onSelectionChange} />)
    await user.click(screen.getByRole('button', { name: /1\.0×/ }))
    await user.click(await screen.findByRole('option', { name: '1.25×' }))
    expect(onSelectionChange).toHaveBeenCalledWith('1.25')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /1\.25×/ })).toBeInTheDocument()
  })

  it('управляется с клавиатуры: стрелка открывает, Enter выбирает, Escape закрывает', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    render(<Select label="Скорость" items={SPEEDS} defaultSelectedKey="1" onSelectionChange={onSelectionChange} />)
    await user.tab()
    await user.keyboard('{ArrowDown}')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelectionChange).toHaveBeenCalledWith('1.25')

    await user.keyboard('{ArrowDown}')
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })
})

describe('ListBox', () => {
  const AUDIO = [
    { id: 'lostfilm', label: 'LostFilm', description: 'RU · AC3 5.1' },
    { id: 'original', label: 'Оригинал', description: 'EN · E-AC3 5.1', badge: 'в файле' },
  ]

  it('показывает описание и метку, выбирает стрелками', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    render(<ListBox aria-label="Озвучка" items={AUDIO} defaultSelectedKey="lostfilm" onSelectionChange={onSelectionChange} />)
    expect(screen.getByText('RU · AC3 5.1')).toBeInTheDocument()
    expect(screen.getByText('в файле')).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Оригинал/ }))
    expect(onSelectionChange).toHaveBeenCalledWith('original')
  })
})
