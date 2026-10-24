import { ToastProvider } from '@kino/ui'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../../../test/tauriMock')).createTauriMock())
vi.mock('../../../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { DownloadsSection } = await import('./DownloadsSection')
const { settingsStore } = await import('../../../../../entities/settings')
const { DEFAULT_SETTINGS } = await import('../../../../../shared/ipc/settings')
const mock = await tauri

function renderSection() {
  render(
    <ToastProvider>
      <DownloadsSection />
    </ToastProvider>,
  )
  return userEvent.setup()
}

const updates = () => mock.calls().filter(([command]) => command === 'settings_update')

describe('DownloadsSection (ТЗ 6 «Загрузки»)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => settingsStore.set(DEFAULT_SETTINGS))
  })

  it('альтернативные лимиты и расписание: время проверяется, верное — сохраняется', async () => {
    const user = renderSection()
    await user.click(screen.getByRole('switch', { name: 'Альтернативные лимиты включены' }))
    await user.clear(screen.getByRole('textbox', { name: 'Альтернативный лимит загрузки' }))
    await user.type(screen.getByRole('textbox', { name: 'Альтернативный лимит загрузки' }), '2048{Enter}')
    expect(screen.queryByRole('textbox', { name: 'С' })).not.toBeInTheDocument()
    act(() => settingsStore.set({ scheduleEnabled: true }))

    const from = screen.getByRole('textbox', { name: 'С' })
    await user.clear(from)
    await user.type(from, '25:00')
    await user.tab()
    expect(from).toHaveAccessibleDescription('Время — часы:минуты, например 08:00')
    await user.clear(from)
    await user.type(from, '23:30{Enter}')
    await user.click(screen.getByRole('radio', { name: 'Будни' }))
    expect(updates()).toEqual([
      ['settings_update', { patch: { altLimitsOn: true } }],
      ['settings_update', { patch: { altDownloadLimit: 2048 } }],
      ['settings_update', { patch: { scheduleFrom: '23:30' } }],
      ['settings_update', { patch: { scheduleDays: 'weekdays' } }],
    ])
  })

  it('соединение — с пометкой о перезапуске; кривой прокси не сохраняется', async () => {
    const user = renderSection()
    expect(screen.getByText('· применится после перезапуска Kino')).toBeInTheDocument()
    const proxy = screen.getByRole('textbox', { name: 'Прокси SOCKS5' })
    await user.type(proxy, 'http://10.0.0.1:8080{Enter}')
    expect(proxy).toHaveAttribute('aria-invalid', 'true')
    await user.clear(proxy)
    await user.type(proxy, 'socks5://10.0.0.1:1080{Enter}')
    await user.click(screen.getByRole('radio', { name: 'TCP' }))
    await user.click(screen.getByRole('switch', { name: 'DHT' }))
    await user.clear(screen.getByRole('textbox', { name: 'Порт для входящих' }))
    await user.type(screen.getByRole('textbox', { name: 'Порт для входящих' }), '99999{Enter}')
    expect(updates()).toEqual([
      ['settings_update', { patch: { proxy: 'socks5://10.0.0.1:1080' } }],
      ['settings_update', { patch: { protocol: 'tcp' } }],
      ['settings_update', { patch: { dht: false } }],
      ['settings_update', { patch: { listenPort: 65535 } }],
    ])
  })

  it('свои трекеры: многострочное поле, не-адрес назван в ошибке', async () => {
    const user = renderSection()
    const trackers = screen.getByRole('textbox', { name: 'Свои трекеры к новым загрузкам' })
    await user.type(trackers, 'udp://t.example:6969/announce{Enter}tracker.example')
    await user.tab()
    expect(trackers).toHaveAccessibleDescription('Это не адрес трекера: tracker.example')
    expect(updates()).toEqual([])
    await user.type(trackers, '{Backspace>15}https://t2.example/announce')
    await user.tab()
    expect(updates()).toEqual([['settings_update', { patch: { extraTrackers: 'udp://t.example:6969/announce\nhttps://t2.example/announce' } }]])
  })

  it('раздача до рейтинга и времени, очередь; «не раздавать» выключает правила раздачи', async () => {
    const user = renderSection()
    await user.clear(screen.getByRole('textbox', { name: 'Раздавать до рейтинга' }))
    await user.type(screen.getByRole('textbox', { name: 'Раздавать до рейтинга' }), '1,555{Enter}')
    await user.click(screen.getByRole('radio', { name: 'В архив' }))
    await user.clear(screen.getByRole('textbox', { name: 'Качать одновременно' }))
    await user.type(screen.getByRole('textbox', { name: 'Качать одновременно' }), '2{Enter}')
    expect(updates()).toEqual([
      ['settings_update', { patch: { seedRatioLimit: 1.56 } }],
      ['settings_update', { patch: { seedLimitAction: 'archive' } }],
      ['settings_update', { patch: { maxActiveDownloads: 2 } }],
    ])
    act(() => settingsStore.set({ noSeeding: true }))
    expect(screen.getByRole('textbox', { name: 'Раздавать не дольше' })).toBeDisabled()
    expect(within(screen.getByRole('radiogroup', { name: 'Затем' })).getByRole('radio', { name: 'Пауза' })).toBeDisabled()
  })
})
