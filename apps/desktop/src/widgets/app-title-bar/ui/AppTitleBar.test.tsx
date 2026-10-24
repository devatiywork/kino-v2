import { ToastProvider } from '@kino/ui'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { AppTitleBar } = await import('./AppTitleBar')
const { torrentsStore } = await import('../../../entities/torrent')
const { routerStore } = await import('../../../shared/lib/router')
const { activeTorrent } = await import('../../../test/torrents')

const renderBar = () => render(<AppTitleBar />, { wrapper: ToastProvider })
const nav = () => screen.getByRole('navigation', { name: 'Разделы' })
const speed = () => screen.queryByRole('button', { name: /^Качается со скоростью/ })

describe('AppTitleBar', () => {
  beforeEach(() => {
    act(() => {
      routerStore.set({ screen: 'home', previous: 'home', seriesKey: null })
      torrentsStore.set({ active: [], downloadSpeed: 0, uploadSpeed: 0 })
    })
  })

  it('на «Загрузках» — сколько качается и ждёт очереди; раздачи не считаются', () => {
    renderBar()
    const downloads = within(nav()).getByRole('button', { name: /^Загрузки/ })
    expect(downloads).toHaveTextContent(/^Загрузки$/)

    act(() =>
      torrentsStore.set({
        active: [
          activeTorrent({ id: 1, state: 'downloading' }),
          activeTorrent({ id: 2, state: 'queued', progress: 0 }),
          activeTorrent({ id: 3, state: 'seeding', progress: 1 }),
        ],
      }),
    )
    expect(downloads).toHaveTextContent(/^Загрузки2$/)
  })

  it('скорость загрузки — пока качается, кроме экрана «Загрузки»; по клику открывает их', async () => {
    const user = userEvent.setup()
    renderBar()
    expect(speed()).toBeNull()

    act(() => torrentsStore.set({ downloadSpeed: 9.3 * 1024 * 1024, uploadSpeed: 6 * 1024 * 1024 }))
    expect(speed()).toHaveAccessibleName('Качается со скоростью 9,3 МБ/с — открыть загрузки')
    expect(speed()).toHaveTextContent('9,3 МБ/с')

    await user.click(speed() as HTMLElement)
    expect(routerStore.get().screen).toBe('downloads')
    // «Загрузки» show the speeds themselves
    expect(speed()).toBeNull()

    act(() => routerStore.set({ screen: 'history' }))
    expect(speed()).not.toBeNull()
    // only the upload: nothing to show
    act(() => torrentsStore.set({ downloadSpeed: 0 }))
    expect(speed()).toBeNull()
  })
})
