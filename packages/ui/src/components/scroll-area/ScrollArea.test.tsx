import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScrollArea } from './ScrollArea'

describe('ScrollArea', () => {
  it('рисует содержимое в прокручиваемой области', () => {
    render(
      <ScrollArea aria-label="Список">
        <p>Серия 1</p>
      </ScrollArea>,
    )
    const viewport = screen.getByLabelText('Список')
    expect(viewport).toHaveClass('overflow-y-auto')
    expect(viewport).toContainElement(screen.getByText('Серия 1'))
  })

  it('сообщает о прокрутке наружу', () => {
    const onScroll = vi.fn()
    render(
      <ScrollArea aria-label="Список" onScroll={onScroll}>
        <p>Серия 1</p>
      </ScrollArea>,
    )
    fireEvent.scroll(screen.getByLabelText('Список'))
    expect(onScroll).toHaveBeenCalledTimes(1)
  })

  it('не показывает полосу, когда содержимое помещается', () => {
    const { container } = render(
      <ScrollArea aria-label="Список">
        <p>Серия 1</p>
      </ScrollArea>,
    )
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('прокидывает стили области, например максимальную высоту', () => {
    render(
      <ScrollArea aria-label="Список" viewportStyle={{ maxHeight: 160 }}>
        <p>Серия 1</p>
      </ScrollArea>,
    )
    expect(screen.getByLabelText('Список')).toHaveStyle({ maxHeight: '160px' })
  })
})
