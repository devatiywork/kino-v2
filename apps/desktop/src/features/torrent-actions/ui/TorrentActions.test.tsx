import { ToastProvider } from '@kino/ui'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { TorrentActions } = await import('./TorrentActions')
const { downloadsView, torrentsStore } = await import('../../../entities/torrent')
const { activeTorrent, categories } = await import('../../../test/torrents')
const mock = await tauri

function renderActions(patch: Parameters<typeof activeTorrent>[0] = {}) {
  render(
    <ToastProvider>
      <TorrentActions torrent={activeTorrent(patch)} />
    </ToastProvider>,
  )
  return userEvent.setup()
}

describe('TorrentActions (integration)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => {
      torrentsStore.set({ categories })
      downloadsView.set({ selected: 7 })
    })
  })

  it('пауза и продолжение', async () => {
    const user = renderActions()
    await user.click(screen.getByRole('button', { name: 'Пауза' }))
    expect(mock.calls()).toEqual([['torrent_pause', { id: 7 }]])
    mock.reset()
    const again = renderActions({ state: 'paused' })
    await again.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(mock.calls()).toEqual([['torrent_resume', { id: 7 }]])
  })

  it('«Убрать из загрузок» — сразу, запись остаётся в архиве', async () => {
    const user = renderActions()
    await user.click(screen.getByRole('button', { name: 'Действия с торрентом' }))
    await user.click(screen.getByRole('menuitem', { name: 'Убрать из загрузок' }))
    expect(mock.calls()).toEqual([['torrent_remove', { id: 7, deleteFiles: false }]])
    expect(downloadsView.get().selected).toBeNull()
    expect(await screen.findByText('Убрано из загрузок. Файлы на месте, запись осталась в архиве')).toBeInTheDocument()
  })

  it('«Удалить с файлами» — только после подтверждения', async () => {
    const user = renderActions()
    await user.click(screen.getByRole('button', { name: 'Действия с торрентом' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить с файлами' }))
    expect(screen.getByRole('alertdialog', { name: 'Удалить файлы?' })).toHaveTextContent('Запись останется в архиве')
    expect(mock.calls()).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Удалить файлы' }))
    expect(mock.calls()).toEqual([['torrent_remove', { id: 7, deleteFiles: true }]])
  })

  it('категория меняется из меню; текущая недоступна', async () => {
    const user = renderActions()
    await user.click(screen.getByRole('button', { name: 'Действия с торрентом' }))
    expect(screen.getByRole('menuitem', { name: 'Категория: Сериалы' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('menuitem', { name: 'Категория: Игры' }))
    expect(mock.calls()).toEqual([['torrent_set_category', { id: 7, categoryId: 2 }]])
  })
})
