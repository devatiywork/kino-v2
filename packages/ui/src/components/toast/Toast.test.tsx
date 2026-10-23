import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../button/Button'
import { ToastProvider, useToast, type ToastOptions } from './ToastProvider'

function Trigger({ options }: { options: ToastOptions }) {
  const toast = useToast()
  return <Button onPress={() => toast.show(options)}>Показать</Button>
}

function renderWithToasts(options: ToastOptions) {
  return render(
    <ToastProvider>
      <Trigger options={options} />
    </ToastProvider>,
  )
}

describe('уведомления', () => {
  it('показывает заголовок и текст в области уведомлений', async () => {
    const user = userEvent.setup()
    renderWithToasts({ title: 'Дорожка «Русский» не найдена', description: 'Выбрана: English' })
    await user.click(screen.getByRole('button', { name: 'Показать' }))
    const region = screen.getByRole('region', { name: 'Уведомления' })
    expect(region).toHaveTextContent('Дорожка «Русский» не найдена')
    expect(region).toHaveTextContent('Выбрана: English')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('исчезает сам через заданное время', async () => {
    const user = userEvent.setup()
    renderWithToasts({ title: 'Громкость 85%', duration: 200 })
    await user.click(screen.getByRole('button', { name: 'Показать' }))
    expect(screen.getByText('Громкость 85%')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Громкость 85%')).not.toBeInTheDocument(), { timeout: 1500 })
  })

  it('кнопка действия выполняет его и закрывает уведомление', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    renderWithToasts({ title: 'История очищена', action: { label: 'Вернуть', onPress: onUndo }, duration: 0 })
    await user.click(screen.getByRole('button', { name: 'Показать' }))
    await user.click(screen.getByRole('button', { name: 'Вернуть' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('ошибка объявляется как alert', async () => {
    const user = userEvent.setup()
    renderWithToasts({ title: 'Файл не поддерживается', tone: 'danger' })
    await user.click(screen.getByRole('button', { name: 'Показать' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Файл не поддерживается')
  })

  it('useToast вне провайдера — понятная ошибка', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Trigger options={{ title: 'x' }} />)).toThrow('ToastProvider')
    spy.mockRestore()
  })
})
