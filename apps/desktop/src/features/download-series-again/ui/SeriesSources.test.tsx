import { ToastProvider } from '@kino/ui'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { SeriesSources } = await import('./SeriesSources')
const { archiveEntry } = await import('../../../test/torrents')
const mock = await tauri

function renderSources() {
  render(
    <ToastProvider>
      <SeriesSources seriesKey="show:severance" />
    </ToastProvider>,
  )
  return userEvent.setup()
}

describe('SeriesSources (integration)', () => {
  beforeEach(() => {
    mock.reset()
    mock.respond('torrent_list', { torrents: [], downloadSpeed: 0, uploadSpeed: 0 })
    mock.respond('torrent_archive', [])
    mock.respond('torrent_categories', [])
  })

  it('все серии на месте — ничего не показывает', async () => {
    mock.respond('app_series_sources', [{ torrent: archiveEntry({ status: 'onDisk' }), episodes: 10, missing: 0 }])
    renderSources()
    await vi.waitFor(() => expect(mock.calls()).toContainEqual(['app_series_sources', { key: 'show:severance' }]))
    expect(screen.queryByRole('region', { name: 'Удалённые серии' })).not.toBeInTheDocument()
  })

  it('серии удалены, торрент в архиве — «Скачать снова» возвращает его в загрузки', async () => {
    mock.respond('app_series_sources', [{ torrent: archiveEntry({ status: 'filesDeleted' }), episodes: 10, missing: 4 }])
    const user = renderSources()
    const region = await screen.findByRole('region', { name: 'Удалённые серии' })
    expect(region).toHaveTextContent('4 серии удалены с диска')
    expect(region).toHaveTextContent('Торрент «Severance.S02.1080p» в архиве')
    await user.click(screen.getByRole('button', { name: 'Скачать снова' }))
    expect(mock.calls()).toContainEqual(['torrent_download_again', { id: 11, saveDir: null, start: true }])
    expect(await screen.findByText('«Severance.S02.1080p» снова в загрузках — серии встанут на место')).toBeInTheDocument()
  })

  it('торрент уже качается — кнопки нет', async () => {
    mock.respond('app_series_sources', [{ torrent: archiveEntry({ status: 'inDownloads' }), episodes: 10, missing: 4 }])
    renderSources()
    expect(await screen.findByText('Уже в загрузках')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Скачать снова' })).not.toBeInTheDocument()
  })
})
