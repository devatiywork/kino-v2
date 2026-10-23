import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TitleBarNav } from './TitleBarNav'

const ITEMS = [
  { id: 'home', label: 'Главная' },
  { id: 'series', label: 'Сериалы' },
  { id: 'downloads', label: 'Загрузки', badge: 2 },
] as const

describe('TitleBarNav', () => {
  it('текущий раздел помечен aria-current', () => {
    render(<TitleBarNav label="Разделы" items={ITEMS} current="series" onNavigate={() => undefined} />)
    expect(screen.getByRole('navigation', { name: 'Разделы' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сериалы' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Главная' })).not.toHaveAttribute('aria-current')
  })

  it('нажатие переходит в раздел, значок виден', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<TitleBarNav label="Разделы" items={ITEMS} current={null} onNavigate={onNavigate} />)
    const downloads = screen.getByRole('button', { name: /Загрузки/ })
    expect(downloads).toHaveTextContent('2')
    await user.click(downloads)
    expect(onNavigate).toHaveBeenCalledWith('downloads')
  })
})
