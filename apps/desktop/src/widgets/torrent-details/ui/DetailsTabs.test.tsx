import { ToastProvider } from '@kino/ui'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TorrentDetails } from '../../../shared/ipc/torrents'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)
const dialog = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => dialog)

const { ParamsTab } = await import('./ParamsTab')
const { SpeedTab } = await import('./SpeedTab')
const { PeersTab, TrackersTab } = await import('./PeersTrackersTabs')
const { PieceMap } = await import('./PieceMap')
const { activeTorrent } = await import('../../../test/torrents')
const mock = await tauri

function details(patch: Partial<TorrentDetails> = {}): TorrentDetails {
  return {
    files: [],
    peers: [],
    trackers: ['udp://tracker.example:80/announce'],
    comment: null,
    createdBy: null,
    createdAt: null,
    private: false,
    pieceSize: 4_194_304,
    pieces: 100,
    magnet: 'magnet:?xt=urn:btih:abc',
    pieceMap: [255, 0],
    peersLive: 2,
    peersSeen: 9,
    lost: 0,
    discovery: { dht: true, pex: true, lsd: true },
    seeding: { mode: 'default' },
    ...patch,
  }
}

const inToasts = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>)

describe('torrent details tabs', () => {
  beforeEach(() => {
    mock.reset()
    dialog.open.mockReset()
    dialog.save.mockReset()
  })

  it('«Скачано» — доля частей на диске', () => {
    render(<PieceMap parts={[255, 255, 0, 0]} label="Скачано" />)
    expect(screen.getByRole('img', { name: 'Скачано: 50%' })).toBeInTheDocument()
  })

  it('пиры — со скоростями; правый клик копирует адрес', async () => {
    render(
      <PeersTab
        peers={[{ address: '10.0.0.5:51413', connection: 'UTP', client: 'qBittorrent 5.0', downloaded: 2_097_152, uploaded: 0, downloadSpeed: 524_288, uploadSpeed: 0 }]}
      />,
    )
    const row = screen.getByRole('row', { name: /10\.0\.0\.5/ })
    expect(row).toHaveTextContent('qBittorrent 5.0')
    expect(row).toHaveTextContent('512 кБ/с')
    // user-event puts its own clipboard in place of the browser's
    const user = userEvent.setup()
    await user.pointer({ keys: '[MouseRight]', target: within(row).getByText('10.0.0.5:51413') })
    await user.click(await screen.findByRole('menuitem', { name: 'Скопировать адрес' }))
    await vi.waitFor(async () => expect(await navigator.clipboard.readText()).toBe('10.0.0.5:51413'))
  })

  it('трекеры: сначала DHT, PeX и LSD; у частного они выключены; «Переобъявить»', async () => {
    const { unmount } = inToasts(<TrackersTab id={7} details={details()} />)
    expect(screen.getByRole('row', { name: /DHT/ })).toHaveTextContent('работает')
    unmount()
    inToasts(<TrackersTab id={7} details={details({ private: true, discovery: { dht: false, pex: false, lsd: false } })} />)
    expect(screen.getByRole('row', { name: /LSD/ })).toHaveTextContent('выключено — частный торрент')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Переобъявить' }))
    expect(mock.calls()).toEqual([['torrent_reannounce', { id: 7 }]])
    expect(await screen.findByText('Трекеры, DHT и LSD опрошены заново')).toBeInTheDocument()
  })

  it('скорость — график за выбранный период', async () => {
    mock.respond('torrent_speed_history', Array.from({ length: 120 }, (_, i) => [i * 1024, 512]))
    render(<SpeedTab id={7} />)
    expect(await screen.findByRole('img', { name: 'График скорости загрузки и отдачи' })).toBeInTheDocument()
    expect(screen.getByText('пик 119 кБ/с')).toBeInTheDocument()
    expect(mock.calls()).toContainEqual(['torrent_speed_history', { id: 7 }])
    await userEvent.setup().click(screen.getByRole('radio', { name: '1 мин' }))
    expect(screen.getByRole('radio', { name: '1 мин' })).toBeChecked()
  })

  it('параметры: раздача до рейтинга, проверка, перенос и .torrent', async () => {
    const onChanged = vi.fn()
    const user = userEvent.setup()
    inToasts(<ParamsTab torrent={activeTorrent()} seeding={{ mode: 'default' }} onChanged={onChanged} />)
    await user.click(screen.getByRole('radio', { name: 'До рейтинга' }))
    expect(mock.calls().at(-1)).toEqual(['torrent_set_seeding', { id: 7, seeding: { mode: 'ratio', ratio: 2 } }])
    await user.click(screen.getByRole('radio', { name: 'Не раздавать' }))
    expect(mock.calls().at(-1)).toEqual(['torrent_set_seeding', { id: 7, seeding: { mode: 'never' } }])

    await user.click(screen.getByRole('button', { name: 'Проверить файлы' }))
    expect(mock.calls().at(-1)).toEqual(['torrent_recheck', { id: 7 }])
    expect(await screen.findByText('Файлы проверяются заново')).toBeInTheDocument()

    dialog.open.mockResolvedValue('E:\\Сериалы')
    await user.click(screen.getByRole('button', { name: 'Переместить файлы…' }))
    await vi.waitFor(() => expect(mock.calls().at(-1)).toEqual(['app_move_torrent', { id: 7, folder: 'E:\\Сериалы' }]))

    dialog.save.mockResolvedValue('D:\\Копии\\Peacemaker.torrent')
    await user.click(screen.getByRole('button', { name: 'Сохранить .torrent…' }))
    await vi.waitFor(() => expect(mock.calls().at(-1)).toEqual(['torrent_save_file', { id: 7, path: 'D:\\Копии\\Peacemaker.torrent' }]))
    expect(dialog.save.mock.calls[0]?.[0]).toMatchObject({ defaultPath: 'Peacemaker.S02.2160p.torrent' })
    expect(onChanged).toHaveBeenCalled()
  })

  it('рейтинг вводится в поле и уходит по Enter', async () => {
    const user = userEvent.setup()
    inToasts(<ParamsTab torrent={activeTorrent()} seeding={{ mode: 'ratio', ratio: 2 }} onChanged={vi.fn()} />)
    const field = screen.getByRole('textbox', { name: 'Рейтинг' })
    await user.clear(field)
    await user.type(field, '1,5{Enter}')
    expect(mock.calls().at(-1)).toEqual(['torrent_set_seeding', { id: 7, seeding: { mode: 'ratio', ratio: 1.5 } }])
  })
})
