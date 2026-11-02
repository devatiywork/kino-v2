import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../../test/tauriMock')).createTauriMock())
vi.mock('../../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { VideoSection } = await import('./VideoSection')
const { settingsStore } = await import('../../../../entities/settings')
const { DEFAULT_SETTINGS } = await import('../../../../shared/ipc/settings')
const mock = await tauri

const patches = () => mock.calls().filter(([command]) => command === 'settings_update').map(([, args]) => (args as { patch: unknown }).patch)

describe('VideoSection («Видео и звук»)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => settingsStore.set(DEFAULT_SETTINGS))
  })

  it('по умолчанию — как mpv: HDR авто, под монитор, яркость от Windows, кадры по звуку', () => {
    render(<VideoSection />)
    expect(within(screen.getByRole('radiogroup', { name: 'Вывод HDR' })).getByRole('radio', { name: 'Авто' })).toBeChecked()
    expect(within(screen.getByRole('radiogroup', { name: 'Пиковая яркость монитора, нит' })).getByRole('radio', { name: 'Авто' })).toBeChecked()
    expect(within(screen.getByRole('radiogroup', { name: 'Тональное отображение' })).getByRole('radio', { name: 'Авто' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'По звуку' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Под монитор' })).toBeChecked()
    // Interpolation needs the display sync
    expect(screen.getByRole('switch', { name: 'Интерполяция кадров' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Передавать звук на ресивер' })).not.toBeChecked()
  })

  it('каждая настройка уходит в ядро сразу', async () => {
    const user = userEvent.setup()
    render(<VideoSection />)
    await user.click(screen.getByRole('radio', { name: 'Только SDR' }))
    await user.click(screen.getByRole('radio', { name: 'Как в фильме' }))
    await user.click(screen.getByRole('radio', { name: '1000' }))
    await user.click(screen.getByRole('radio', { name: 'ST 2094-40' }))
    await user.click(screen.getByRole('radio', { name: 'По экрану' }))
    await user.click(screen.getByRole('switch', { name: 'Интерполяция кадров' }))
    await user.click(screen.getByRole('switch', { name: 'Монопольный режим звука' }))
    await user.click(screen.getByRole('switch', { name: 'Журнал воспроизведения' }))
    expect(patches()).toEqual([
      { hdrOutput: 'off' },
      { hdrMode: 'source' },
      { hdrPeak: 1000 },
      { toneMapping: 'st209440' },
      { videoSync: 'display' },
      { interpolation: true },
      { audioExclusive: true },
      { playbackLog: true },
    ])
  })
})
