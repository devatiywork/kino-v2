import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { DefaultAppsRow } = await import('./DefaultAppsRow')
const mock = await tauri

const handlers = (torrent: string | null, isKino = false) => ({
  video: { name: 'Кино и ТВ', isKino: false },
  torrent: { name: torrent, isKino },
  magnet: { name: null, isKino: false },
})

describe('DefaultAppsRow (ТЗ 6: Kino как обработчик)', () => {
  beforeEach(() => mock.reset())

  it('показывает, чем Windows открывает их сейчас, и ведёт в её «Приложения по умолчанию»', async () => {
    const user = userEvent.setup()
    mock.respond('app_default_handlers', handlers('qBittorrent'))
    render(<DefaultAppsRow kinds={['torrent', 'magnet']} label="Kino как обработчик .torrent и magnet:" />)
    expect(await screen.findByText('.torrent — qBittorrent · magnet-ссылки — программа не выбрана')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Выбрать в Windows…' }))
    expect(mock.calls().at(-1)).toEqual(['app_open_default_apps', undefined])
  })

  it('вернувшись из параметров Windows, читает выбор заново', async () => {
    mock.respond('app_default_handlers', handlers('qBittorrent'))
    render(<DefaultAppsRow kinds={['torrent']} label="Обработчик" />)
    expect(await screen.findByText('.torrent — qBittorrent')).toBeInTheDocument()
    mock.respond('app_default_handlers', handlers('kino-desktop', true))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(await screen.findByText('.torrent — Kino')).toBeInTheDocument()
  })
})
