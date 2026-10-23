import { ToastProvider } from '@kino/ui'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { ArchiveActions } = await import('./ArchiveActions')
const { downloadsView, torrentsStore } = await import('../../../entities/torrent')
const { archiveEntry, categories } = await import('../../../test/torrents')
const mock = await tauri

function renderActions(patch: Parameters<typeof archiveEntry>[0] = {}) {
  render(
    <ToastProvider>
      <ArchiveActions entry={archiveEntry(patch)} />
    </ToastProvider>,
  )
  return userEvent.setup()
}

describe('ArchiveActions (integration)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => {
      torrentsStore.set({ categories })
      downloadsView.set({ tab: 'archive', selected: null })
    })
    mock.respond('torrent_list', { torrents: [], downloadSpeed: 0, uploadSpeed: 0 })
    mock.respond('torrent_categories', categories)
    mock.respond('torrent_archive', [])
  })

  it('файлы удалены — «Скачать снова» в один клик, в прежнюю папку', async () => {
    const user = renderActions({ status: 'filesDeleted' })
    await user.click(screen.getByRole('button', { name: 'Скачать снова' }))
    expect(mock.calls()[0]).toEqual(['torrent_download_again', { id: 11, saveDir: null, start: true }])
    await vi.waitFor(() => expect(downloadsView.get()).toMatchObject({ tab: 'downloads', selected: 11 }))
  })

  it('файлы на диске — «Снова раздавать»', async () => {
    const user = renderActions({ status: 'onDisk' })
    expect(screen.getByRole('button', { name: 'Открыть папку' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Действия с записью' }))
    await user.click(screen.getByRole('menuitem', { name: 'Снова раздавать' }))
    expect(mock.calls()[0]).toEqual(['torrent_seed_again', { id: 11 }])
  })

  it('«Удалить из архива» — с подтверждением; пока в загрузках — нельзя', async () => {
    const user = renderActions({ status: 'onDisk' })
    await user.click(screen.getByRole('button', { name: 'Действия с записью' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить из архива' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('а файлы на диске останутся')
    await user.click(screen.getByRole('button', { name: 'Удалить из архива' }))
    expect(mock.calls()).toEqual([['torrent_delete_record', { id: 11 }]])

    mock.reset()
    const active = renderActions({ id: 12, status: 'inDownloads' })
    await active.click(screen.getAllByRole('button', { name: 'Действия с записью' })[1] as HTMLElement)
    expect(screen.getByRole('menuitem', { name: 'Удалить из архива' })).toHaveAttribute('aria-disabled', 'true')
  })
})
