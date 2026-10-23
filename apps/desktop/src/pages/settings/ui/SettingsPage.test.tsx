import { ToastProvider } from '@kino/ui'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { SettingsPage } = await import('./SettingsPage')
const { settingsStore } = await import('../../../entities/settings')
const { libraryStore } = await import('../../../entities/library')
const { DEFAULT_SETTINGS } = await import('../../../shared/ipc/settings')
const mock = await tauri

function renderPage() {
  render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
  )
  return userEvent.setup()
}

describe('SettingsPage', () => {
  beforeEach(() => {
    mock.reset()
    act(() => settingsStore.set(DEFAULT_SETTINGS))
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('разделы ТЗ 6 — в меню и на странице', () => {
    renderPage()
    const sections = ['Внешний вид', 'Воспроизведение', 'Озвучка и субтитры', 'Библиотека и история', 'Горячие клавиши', 'Система']
    for (const name of sections) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Внешний вид' })).toHaveAttribute('aria-current', 'true')
  })

  it('пункт меню прокручивает к разделу и становится текущим', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Горячие клавиши' }))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Горячие клавиши' })).toHaveAttribute('aria-current', 'true')
  })

  it('переключатели и варианты сразу уходят в ядро — без кнопки «Сохранить»', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('switch', { name: 'Продолжать с места остановки' }))
    await user.click(screen.getByRole('radio', { name: 'Светлое' }))
    await user.click(screen.getByRole('radio', { name: '1.5×' }))
    await user.click(screen.getByRole('radio', { name: 'Бирюзовый' }))
    await user.click(screen.getByRole('radio', { name: '95%' }))
    expect(mock.calls()).toEqual([
      ['settings_update', { patch: { resume: false } }],
      ['settings_update', { patch: { theme: 'light' } }],
      ['settings_update', { patch: { defaultSpeed: 1.5 } }],
      ['settings_update', { patch: { accent: 'teal' } }],
      ['settings_update', { patch: { watchedPercent: 95 } }],
    ])
    expect(screen.queryByRole('button', { name: /Сохранить/ })).not.toBeInTheDocument()
  })

  it('папки сериалов — те же, что на экране «Сериалы»', () => {
    act(() => libraryStore.set({ folders: [{ id: 1, path: 'D:\\Сериалы', exists: true }] }))
    renderPage()
    expect(screen.getByRole('list', { name: 'Папки медиатеки' })).toHaveTextContent('D:\\Сериалы')
    expect(screen.getByRole('button', { name: 'Добавить папку' })).toBeInTheDocument()
  })

  it('«Вернуть стандартные» доступно, только когда клавиши переназначены', async () => {
    const user = renderPage()
    expect(screen.getByRole('button', { name: 'Вернуть стандартные' })).toBeDisabled()
    act(() => settingsStore.set({ hotkeys: { togglePause: 'KeyK' } }))
    await user.click(screen.getByRole('button', { name: 'Вернуть стандартные' }))
    expect(mock.calls()).toEqual([['settings_update', { patch: { hotkeys: {} } }]])
  })
})
