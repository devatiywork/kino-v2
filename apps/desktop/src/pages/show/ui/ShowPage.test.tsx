import { ToastProvider } from '@kino/ui'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seriesDetail } from '../../../test/series'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

const { ShowPage } = await import('./ShowPage')
const { routerStore } = await import('../../../shared/lib/router')
const mock = await tauri

const renderShow = () =>
  render(
    <ToastProvider>
      <ShowPage />
    </ToastProvider>,
  )

describe('ShowPage (integration)', () => {
  beforeEach(() => {
    mock.reset()
    routerStore.set({ screen: 'show', previous: 'library', seriesKey: 'show:kino test' })
    mock.respond('app_series_sources', [])
  })

  it('что смотреть дальше, запомненные дорожки и серии по порядку', async () => {
    mock.respond('library_series_detail', seriesDetail())
    renderShow()
    expect(await screen.findByRole('heading', { level: 1, name: 'Kino Test' })).toBeInTheDocument()
    expect(mock.calls()).toContainEqual(['library_series_detail', { key: 'show:kino test' }])

    expect(screen.getByRole('button', { name: 'Серия 2 с 1:42' })).toBeInTheDocument()
    expect(screen.getByText('1 из 3')).toBeInTheDocument()
    expect(screen.getByText('English.mka')).toBeInTheDocument()
    expect(screen.getByText('выключены')).toBeInTheDocument()

    const rows = within(screen.getByRole('list')).getAllByRole('button')
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Серия 1, Просмотрена',
      'Серия 2, 1:42 из 1:00:00',
      'Серия 3, Не начата',
    ])
  })

  it('кнопка «Серия 2» открывает её в плеере', async () => {
    const user = userEvent.setup()
    mock.respond('library_series_detail', seriesDetail())
    mock.respond('player_open', { resumedFrom: 102 })
    renderShow()
    await user.click(await screen.findByRole('button', { name: 'Серия 2 с 1:42' }))
    await waitFor(() => expect(routerStore.get().screen).toBe('player'))
    expect(mock.calls()).toContainEqual(['player_open', { path: 'E:\\Сериалы\\Soprano\\The.Sopranos.S01E02.mkv' }])
  })

  it('всё просмотрено — так и написано, «С начала сезона» остаётся', async () => {
    mock.respond('library_series_detail', seriesDetail({ nextUp: null }))
    renderShow()
    expect(await screen.findByText('Все серии просмотрены')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'С начала сезона' })).toBeInTheDocument()
  })

  it('неизвестный сериал', async () => {
    mock.respond('library_series_detail', null)
    renderShow()
    expect(await screen.findByText('Сериал не найден')).toBeInTheDocument()
  })
})
