import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('поле с подписью и пояснением, ввод уходит в onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TextField label="Страница раздачи" description="Необязательно" onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Страница раздачи' })
    expect(input).toHaveAccessibleDescription('Необязательно')
    await user.type(input, 'https://rutor.info')
    expect(onChange).toHaveBeenLastCalledWith('https://rutor.info')
  })

  it('подпись может быть только для читалки экрана, справа — кнопка', () => {
    render(<TextField label="Папка" showLabel={false} value={'D:\\Сериалы'} onChange={() => undefined} addon={<button type="button">Обзор</button>} />)
    expect(screen.getByText('Папка')).toHaveClass('sr-only')
    expect(screen.getByRole('textbox', { name: 'Папка' })).toHaveValue('D:\\Сериалы')
    expect(screen.getByRole('button', { name: 'Обзор' })).toBeInTheDocument()
  })

  it('многострочное поле: Enter — новая строка, не отправка', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TextField label="Трекеры" multiline rows={3} onChange={onChange} />)
    const area = screen.getByRole('textbox', { name: 'Трекеры' })
    expect(area.tagName).toBe('TEXTAREA')
    expect(area).toHaveAttribute('rows', '3')
    await user.type(area, 'udp://a{Enter}udp://b')
    expect(onChange).toHaveBeenLastCalledWith('udp://a\nudp://b')
  })

  it('ошибка видна и озвучивается', () => {
    render(<TextField label="Magnet-ссылка" value="abc" onChange={() => undefined} isInvalid errorMessage="Это не magnet-ссылка" />)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Это не magnet-ссылка')
  })
})
