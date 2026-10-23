import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Tabs } from './Tabs'

const SEASONS = [
  { id: 's1', label: 'Сезон 1', count: 8 },
  { id: 's2', label: 'Сезон 2', count: 8 },
  { id: 's3', label: 'Сезон 3', count: 0, isDisabled: true },
]

describe('Tabs', () => {
  it('показывает вкладки с количеством и панель выбранной', () => {
    render(
      <Tabs aria-label="Сезоны" items={SEASONS} defaultSelectedKey="s2">
        {(season) => <p>Серии: {season.label}</p>}
      </Tabs>,
    )
    expect(screen.getByRole('tablist', { name: 'Сезоны' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Сезон 2/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Серии: Сезон 2')
  })

  it('клик и стрелки переключают вкладку, отключённая пропускается', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    render(
      <Tabs aria-label="Сезоны" items={SEASONS} defaultSelectedKey="s2" onSelectionChange={onSelectionChange}>
        {(season) => <p>Серии: {season.label}</p>}
      </Tabs>,
    )
    await user.click(screen.getByRole('tab', { name: /Сезон 1/ }))
    expect(onSelectionChange).toHaveBeenLastCalledWith('s1')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Серии: Сезон 1')
    await user.keyboard('{ArrowRight}')
    expect(onSelectionChange).toHaveBeenLastCalledWith('s2')
    await user.keyboard('{ArrowRight}')
    expect(onSelectionChange).toHaveBeenLastCalledWith('s1')
  })
})
