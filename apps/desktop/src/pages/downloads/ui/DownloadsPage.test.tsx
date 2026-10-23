import { ToastProvider } from '@kino/ui'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { DownloadsPage } = await import('./DownloadsPage')
const { downloadsView, torrentsStore } = await import('../../../entities/torrent')
const { addTorrentStore } = await import('../../../features/add-torrent')
const { activeTorrent, archiveEntry, categories, preview } = await import('../../../test/torrents')
const mock = await tauri

function renderPage() {
  render(
    <ToastProvider>
      <DownloadsPage />
    </ToastProvider>,
  )
  return userEvent.setup()
}

describe('DownloadsPage', () => {
  beforeEach(() => {
    mock.reset()
    act(() => {
      addTorrentStore.set({ preview: null, magnetOpen: false })
      downloadsView.set({ tab: 'downloads', category: 'all', selected: null })
      torrentsStore.set({
        categories,
        active: [activeTorrent(), activeTorrent({ id: 8, name: 'Ubuntu 26.04', categoryId: 3, state: 'seeding', progress: 1, ratio: 2.31 })],
        archive: [archiveEntry()],
        archiveCount: 3,
      })
    })
    mock.respond('torrent_details', null)
  })

  it('вкладки с числами, фильтр по категории, строки с состоянием', async () => {
    const user = renderPage()
    expect(screen.getByRole('tab', { name: /Загрузки/ })).toHaveTextContent('2')
    expect(screen.getByRole('tab', { name: /Архив/ })).toHaveTextContent('3')
    const list = screen.getByRole('list', { name: 'Загрузки' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText(/рейтинг 2,31/)).toBeInTheDocument()

    await user.click(within(screen.getByRole('group', { name: 'Категории' })).getByRole('button', { name: /Программы/ }))
    expect(within(screen.getByRole('list', { name: 'Загрузки' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('клик по торренту открывает подробности', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Подробности торрента Peacemaker.S02.2160p' }))
    expect(screen.getByRole('region', { name: 'Подробности торрента' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Общее' })).toHaveAttribute('aria-selected', 'true')
    await vi.waitFor(() => expect(mock.calls()).toContainEqual(['torrent_details', { id: 7 }]))
  })

  it('Ctrl V с magnet-ссылкой — сразу в окно добавления', async () => {
    renderPage()
    mock.respond('torrent_preview', preview())
    const data = { getData: () => 'смотри: magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=Shogun' }
    fireEvent(window, Object.assign(new Event('paste'), { clipboardData: data }))
    await vi.waitFor(() => expect(addTorrentStore.get().preview?.name).toBe('Shogun.S01.2160p'))
    expect(mock.calls()).toContainEqual([
      'torrent_preview',
      { source: { kind: 'magnet', uri: 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=Shogun' } },
    ])
  })
})
