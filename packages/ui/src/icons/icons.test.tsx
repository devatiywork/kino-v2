import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from '../components/logo/Logo'
import * as icons from './index'

describe('иконки', () => {
  it('по умолчанию декоративные и скрыты от скринридера', () => {
    const { container } = render(<icons.IconPlay />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '20')
  })

  it('с подписью становятся изображением с именем', () => {
    render(<icons.IconCheck label="Досмотрено" size={16} />)
    const svg = screen.getByRole('img', { name: 'Досмотрено' })
    expect(svg).toHaveAttribute('width', '16')
  })

  it('у каждой иконки есть имя компонента', () => {
    const components = Object.entries(icons).filter(([name]) => name.startsWith('Icon'))
    expect(components.length).toBeGreaterThan(30)
    for (const [name, component] of components) {
      expect((component as { displayName: string }).displayName).toBe(name)
    }
  })
})

describe('Logo', () => {
  it('читается как «Kino»', () => {
    render(<Logo />)
    expect(screen.getByRole('img', { name: 'Kino' })).toBeInTheDocument()
  })
})
