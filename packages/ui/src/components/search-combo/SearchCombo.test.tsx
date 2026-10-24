import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchCombo, type SearchComboSection } from './SearchCombo'

const ALL: SearchComboSection[] = [
  { id: 'series', title: 'Сериалы', items: [{ id: 'series:shogun', label: 'Сёгун', description: 'Сезон 1 · 10 серий' }] },
  {
    id: 'history',
    title: 'История',
    items: [
      { id: 'file:1', label: 'Сёгун · Серия 2', description: 'остановились на 23:14' },
      { id: 'file:2', label: 'Сёгун · Серия 1', description: 'досмотрено' },
    ],
  },
]

/** The field with its own query; the results follow the query like the app's search */
function Harness({ onAction = vi.fn() }: { onAction?: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const sections = query.trim() === '' ? [] : query.includes('сёг') ? ALL : []
  return (
    <SearchCombo
      label="Поиск"
      placeholder="Поиск по истории и архиву"
      shortcut="Ctrl K"
      value={query}
      onChange={setQuery}
      sections={sections}
      onAction={(id) => {
        onAction(id)
        setQuery('')
      }}
      emptyText={`Ничего не найдено по запросу «${query}»`}
    />
  )
}

describe('SearchCombo', () => {
  it('пустое поле — подсказка сочетания, списка нет', () => {
    render(<Harness />)
    expect(screen.getByRole('combobox', { name: 'Поиск' })).toHaveAttribute('placeholder', 'Поиск по истории и архиву')
    expect(screen.getByText('Ctrl K')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('найденное — по группам с заголовками, щелчок открывает', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<Harness onAction={onAction} />)
    await user.type(screen.getByRole('combobox'), 'сёг')
    const list = await screen.findByRole('listbox')
    expect(within(list).getByRole('group', { name: 'Сериалы' })).toBeInTheDocument()
    expect(within(list).getAllByRole('option')).toHaveLength(3)
    // The name is the label; the line under it is the description
    expect(within(list).getByRole('option', { name: 'Сёгун · Серия 2' })).toHaveAccessibleDescription('остановились на 23:14')
    await user.click(within(list).getByRole('option', { name: 'Сёгун · Серия 2' }))
    expect(onAction).toHaveBeenCalledWith('file:1')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('стрелки и Enter — с клавиатуры', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<Harness onAction={onAction} />)
    await user.type(screen.getByRole('combobox'), 'сёг')
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onAction).toHaveBeenCalledWith('file:1')
  })

  it('ничего не нашлось — так и сказано; крестик очищает поле', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByRole('combobox'), 'zzz')
    expect(await screen.findByText('Ничего не найдено по запросу «zzz»')).toBeInTheDocument()
    // While the list is open react-aria hides everything but the field and the list from screen readers:
    // the cross has no accessible name then, only its label
    await user.click(screen.getByLabelText('Очистить'))
    expect(screen.getByRole('combobox')).toHaveValue('')
    await waitFor(() => expect(screen.queryByText(/Ничего не найдено/)).not.toBeInTheDocument())
  })

  it('Escape закрывает список', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByRole('combobox'), 'сёг')
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })
})
