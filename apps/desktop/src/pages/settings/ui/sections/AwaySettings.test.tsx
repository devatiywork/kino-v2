import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../../test/tauriMock')).createTauriMock())
vi.mock('../../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { AwaySettings } = await import('./AwaySettings')
const { settingsStore } = await import('../../../../entities/settings')
const { DEFAULT_SETTINGS } = await import('../../../../shared/ipc/settings')
const mock = await tauri

const patches = () => mock.calls().filter(([command]) => command === 'settings_update').map(([, args]) => (args as { patch: unknown }).patch)

describe('AwaySettings («Пауза, когда вы отходите»)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => settingsStore.set(DEFAULT_SETTINGS))
  })

  it('по умолчанию выключено: камера не включается, остальное недоступно', () => {
    render(<AwaySettings />)
    expect(screen.getByRole('switch', { name: 'Пауза, когда вы отходите' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Продолжать, когда вернётесь' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '20 с' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '20 с' })).toBeDisabled()
  })

  it('включение, время и продолжение уходят в ядро', async () => {
    const user = userEvent.setup()
    render(<AwaySettings />)
    await user.click(screen.getByRole('switch', { name: 'Пауза, когда вы отходите' }))
    await user.click(screen.getByRole('radio', { name: '60 с' }))
    await user.click(screen.getByRole('switch', { name: 'Продолжать, когда вернётесь' }))
    expect(patches()).toEqual([{ awayPause: true }, { awayAfter: 60 }, { awayResume: false }])
  })

  it('«Проверить камеру» говорит, что увидела', async () => {
    const user = userEvent.setup()
    mock.respond('presence_check', { kind: 'seen', camera: 'HD Webcam', faces: 1 })
    render(<AwaySettings />)
    await user.click(screen.getByRole('button', { name: 'Проверить камеру' }))
    expect(await screen.findByRole('status')).toHaveTextContent('«HD Webcam»: вижу вас')

    mock.respond('presence_check', { kind: 'unavailable', reason: 'denied' })
    await user.click(screen.getByRole('button', { name: 'Проверить камеру' }))
    expect(await screen.findByText(/Доступ к камере выключен/)).toBeInTheDocument()
  })
})
