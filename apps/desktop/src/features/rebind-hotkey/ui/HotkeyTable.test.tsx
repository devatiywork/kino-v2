import { ToastProvider } from '@kino/ui'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { HotkeyTable } = await import('./HotkeyTable')
const { settingsStore } = await import('../../../entities/settings')
const { DEFAULT_SETTINGS } = await import('../../../shared/ipc/settings')
const mock = await tauri

function renderTable() {
  render(
    <ToastProvider>
      <HotkeyTable />
    </ToastProvider>,
  )
  return userEvent.setup()
}

describe('HotkeyTable', () => {
  beforeEach(() => {
    mock.reset()
    act(() => settingsStore.set(DEFAULT_SETTINGS))
  })

  it('показывает действия плеера с их клавишами; Escape не меняется', () => {
    renderTable()
    expect(screen.getByRole('button', { name: /^Пауза \/ воспроизведение — Пробел/ })).toHaveTextContent('Пробел')
    expect(screen.getByRole('button', { name: /^Назад на 10 секунд — ←/ })).toBeInTheDocument()
    const escape = screen.getByRole('row', { name: /Выйти из полного экрана/ })
    expect(within(escape).queryByRole('button')).not.toBeInTheDocument()
  })

  it('клик и новая клавиша — переназначено и сохранено в настройках', async () => {
    mock.respond('settings_update', { ...DEFAULT_SETTINGS, hotkeys: { togglePause: 'KeyK' } })
    const user = renderTable()
    await user.click(screen.getByRole('button', { name: /^Пауза \/ воспроизведение/ }))
    await user.keyboard('k')
    expect(mock.calls()).toEqual([['settings_update', { patch: { hotkeys: { togglePause: 'KeyK' } } }]])
    expect(await screen.findByRole('button', { name: /^Пауза \/ воспроизведение — K/ })).toBeInTheDocument()
  })

  it('занятая клавиша меняется местами — и об этом сказано', async () => {
    const user = renderTable()
    await user.click(screen.getByRole('button', { name: /^Пауза \/ воспроизведение/ }))
    await user.keyboard('s')
    expect(mock.calls()).toEqual([['settings_update', { patch: { hotkeys: { togglePause: 'KeyS', toggleSubtitles: 'Space' } } }]])
    expect(await screen.findByText('S теперь — «Пауза / воспроизведение», а «Субтитры вкл/выкл» — Пробел')).toBeInTheDocument()
  })

  it('Tab не назначается', async () => {
    const user = renderTable()
    await user.click(screen.getByRole('button', { name: /^Громче/ }))
    await user.keyboard('{Tab}')
    expect(mock.calls()).toEqual([])
    expect(await screen.findByText(/Tab не назначается/)).toBeInTheDocument()
  })
})
