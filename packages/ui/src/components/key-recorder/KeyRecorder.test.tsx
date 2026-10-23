import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { KeyRecorder } from './KeyRecorder'

function setup() {
  const onRecord = vi.fn()
  const onPageKey = vi.fn()
  window.addEventListener('keydown', onPageKey)
  render(
    <KeyRecorder aria-label="Пауза — Пробел" listeningLabel="Нажмите клавишу" onRecord={onRecord}>
      Пробел
    </KeyRecorder>,
  )
  return { user: userEvent.setup(), onRecord, onPageKey, button: screen.getByRole('button', { name: 'Пауза — Пробел' }) }
}

describe('KeyRecorder', () => {
  it('нажатие включает ожидание, следующая клавиша записывается', async () => {
    const { user, onRecord, onPageKey, button } = setup()
    expect(button).toHaveTextContent('Пробел')
    await user.click(button)
    expect(button).toHaveTextContent('Нажмите клавишу')
    expect(button).toHaveAttribute('data-listening')

    await user.keyboard('k')
    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ code: 'KeyK', ctrlKey: false }))
    expect(onPageKey).not.toHaveBeenCalled()
    expect(button).toHaveTextContent('Пробел')
  })

  it('модификаторы сами по себе не считаются, Escape отменяет', async () => {
    const { user, onRecord, button } = setup()
    await user.click(button)
    await user.keyboard('{Shift}')
    expect(button).toHaveAttribute('data-listening')
    await user.keyboard('{Escape}')
    expect(button).not.toHaveAttribute('data-listening')
    expect(onRecord).not.toHaveBeenCalled()
  })

  it('пробел во время ожидания записывается, а не нажимает кнопку снова', async () => {
    const { user, onRecord, button } = setup()
    await user.click(button)
    await user.keyboard(' ')
    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ code: 'Space' }))
    expect(button).not.toHaveAttribute('data-listening')
  })

  it('уход фокуса отменяет ожидание', async () => {
    const { user, button } = setup()
    await user.click(button)
    await user.click(document.body)
    expect(button).not.toHaveAttribute('data-listening')
  })
})
