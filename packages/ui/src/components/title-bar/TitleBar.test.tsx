import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TitleBar } from './TitleBar'
import { WindowControls } from './WindowControls'

describe('TitleBar', () => {
  it('пустые места заголовка тянут окно (data-tauri-drag-region)', () => {
    const { container } = render(
      <TitleBar center={<input aria-label="Поиск" />} end={<button type="button">Открыть</button>} controls={<WindowControls />}>
        <span>Kino</span>
      </TitleBar>,
    )
    const header = container.querySelector('header')
    expect(header).toHaveAttribute('data-tauri-drag-region')
    // The header and its three columns; what is inside them does not drag
    expect(container.querySelectorAll('[data-tauri-drag-region]')).toHaveLength(4)
    expect(screen.getByRole('textbox', { name: 'Поиск' })).not.toHaveAttribute('data-tauri-drag-region')
  })

  it('поиск — в средней колонке, между левой частью и действиями', () => {
    const { container } = render(
      <TitleBar center={<input aria-label="Поиск" />} end={<button type="button">Открыть</button>}>
        <span>Kino</span>
      </TitleBar>,
    )
    const columns = container.querySelectorAll('header > div')
    expect([...columns].map((column) => column.textContent || column.querySelector('input')?.getAttribute('aria-label'))).toEqual(['Kino', 'Поиск', 'Открыть'])
  })
})

describe('WindowControls', () => {
  it('кнопки вызывают действия окна', async () => {
    const user = userEvent.setup()
    const onMinimize = vi.fn()
    const onToggleMaximize = vi.fn()
    const onClose = vi.fn()
    render(<WindowControls onMinimize={onMinimize} onToggleMaximize={onToggleMaximize} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Свернуть' }))
    await user.click(screen.getByRole('button', { name: 'Развернуть' }))
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onMinimize).toHaveBeenCalledTimes(1)
    expect(onToggleMaximize).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('у развёрнутого окна кнопка называется «Восстановить»', () => {
    render(<WindowControls isMaximized />)
    expect(screen.getByRole('button', { name: 'Восстановить' })).toBeInTheDocument()
  })

  it('кнопки окна не попадают в обход по Tab, как в Windows', () => {
    render(<WindowControls />)
    for (const button of screen.getAllByRole('button')) expect(button).toHaveAttribute('tabindex', '-1')
  })
})
