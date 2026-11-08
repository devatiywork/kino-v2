import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { WatchStats } from './WatchStats'

const stats = {
  week: { seconds: 45 * 60, episodes: 1, films: 0 },
  month: { seconds: 12 * 3600 + 30 * 60, episodes: 8, films: 2 },
  year: { seconds: 0, episodes: 0, films: 0 },
}

/** The figure under a label: «8» над «серий досмотрено» */
const figure = (label: string) => screen.getByText(label).nextSibling?.textContent

describe('WatchStats («Статистика просмотра»)', () => {
  it('неделя по умолчанию: время просмотра и досмотренное, с правильными окончаниями', () => {
    render(<WatchStats stats={stats} />)
    const block = screen.getByRole('region', { name: 'Статистика просмотра' })
    expect(within(block).getByText('за последние 7 дней')).toBeInTheDocument()
    expect(within(block).getByRole('radio', { name: 'Неделя' })).toBeChecked()
    expect(figure('время просмотра')).toBe('45 мин')
    expect(figure('серия досмотрена')).toBe('1')
    expect(figure('фильмов досмотрено')).toBe('0')
  })

  it('переключатель меняет период', async () => {
    const user = userEvent.setup()
    render(<WatchStats stats={stats} />)
    await user.click(screen.getByRole('radio', { name: 'Месяц' }))
    expect(screen.getByText('за последние 30 дней')).toBeInTheDocument()
    expect(figure('время просмотра')).toBe('12 ч 30 мин')
    expect(figure('серий досмотрено')).toBe('8')
    expect(figure('фильма досмотрены')).toBe('2')

    await user.click(screen.getByRole('radio', { name: 'Год' }))
    expect(screen.getByText('за последние 365 дней')).toBeInTheDocument()
    expect(figure('время просмотра')).toBe('0 мин')
  })
})
