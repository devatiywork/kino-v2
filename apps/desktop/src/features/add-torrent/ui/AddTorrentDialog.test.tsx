import { ToastProvider } from '@kino/ui'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { AddTorrentDialog } = await import('./AddTorrentDialog')
const { addTorrentStore, openTorrentFile } = await import('../model/addTorrent')
const { downloadsView, torrentsStore } = await import('../../../entities/torrent')
const { routerStore } = await import('../../../shared/lib/router')
const { archiveEntry, categories, preview } = await import('../../../test/torrents')
const mock = await tauri

function renderDialog() {
  render(
    <ToastProvider>
      <AddTorrentDialog />
    </ToastProvider>,
  )
  return userEvent.setup()
}

async function open(patch: Parameters<typeof preview>[0] = {}) {
  mock.respond('torrent_preview', preview(patch))
  await act(() => openTorrentFile('D:\\Shogun.S01.2160p.torrent'))
}

describe('AddTorrentDialog (integration)', () => {
  beforeEach(() => {
    mock.reset()
    localStorage.clear()
    act(() => {
      addTorrentStore.set({ preview: null })
      torrentsStore.set({ categories, downloadsFolder: 'D:\\Загрузки', active: [], archive: [] })
      downloadsView.set({ tab: 'archive', selected: null, category: 2 })
      routerStore.set({ screen: 'home' })
    })
    mock.respond('torrent_list', { torrents: [], downloadSpeed: 0, uploadSpeed: 0 })
    mock.respond('torrent_categories', categories)
    mock.respond('torrent_archive', [])
  })

  it('показывает торрент: имя, размер, файлы; категория и её папка — по умолчанию', async () => {
    renderDialog()
    await open()
    const dialog = screen.getByRole('dialog', { name: 'Добавить торрент' })
    expect(within(dialog).getByText('Shogun.S01.2160p')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('checkbox', { checked: true })).toHaveLength(4)
    expect(within(dialog).getByRole('radio', { name: 'Сериалы' })).toBeChecked()
    expect(within(dialog).getByRole('textbox', { name: 'Папка' })).toHaveValue('D:\\Загрузки\\Сериалы')
  })

  it('выбор категории меняет папку, снятые файлы не скачиваются, запись — в архив', async () => {
    const user = renderDialog()
    await open()
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByText('Игры'))
    expect(within(dialog).getByRole('textbox', { name: 'Папка' })).toHaveValue('E:\\Игры')
    await user.click(within(dialog).getByText('Subs\\Rus.srt'))
    await user.type(within(dialog).getByRole('textbox', { name: 'Страница раздачи' }), 'https://rutor.info/torrent/1')
    mock.respond('torrent_add', 42)
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))

    expect(mock.calls().find(([command]) => command === 'torrent_add')).toEqual([
      'torrent_add',
      {
        request: {
          infoHash: '2222222222222222222222222222222222222222',
          categoryId: 2,
          saveDir: 'E:\\Игры',
          onlyFiles: [0, 1],
          sourceUrl: 'https://rutor.info/torrent/1',
          start: true,
        },
      },
    ])
    expect(downloadsView.get()).toMatchObject({ tab: 'downloads', selected: 42, category: 'all' })
    expect(routerStore.get().screen).toBe('downloads')
    expect(await screen.findByText('Добавлено в «Игры» и сохранено в архиве вместе со ссылкой на раздачу')).toBeInTheDocument()
  })

  it('без файлов добавить нельзя', async () => {
    const user = renderDialog()
    await open()
    await user.click(screen.getByText('Все файлы'))
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled()
    expect(screen.getByText('Выберите хотя бы один файл')).toBeInTheDocument()
  })

  it('тот же торрент из архива — без второй записи: файлы удалены — «Скачать снова»', async () => {
    const user = renderDialog()
    await open({ duplicate: archiveEntry({ status: 'filesDeleted' }) })
    expect(screen.getByRole('dialog', { name: 'Этот торрент уже в архиве' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Уже в архиве · Сериалы')
    await user.click(screen.getByRole('button', { name: 'Скачать снова' }))
    expect(mock.calls().find(([command]) => command === 'torrent_download_again')).toEqual([
      'torrent_download_again',
      { id: 11, saveDir: 'D:\\Загрузки\\Сериалы', start: true },
    ])
    expect(mock.calls().some(([command]) => command === 'torrent_add')).toBe(false)
  })

  it('торрент с трекера: откуда он и страница раздачи уже в форме, ссылка уходит в архив', async () => {
    const user = renderDialog()
    mock.respond('torrent_preview', preview())
    await act(() => openTorrentFile('C:\\Kino\\trackers\\downloads\\1-shogun.torrent', 'https://rutracker.org/forum/viewtopic.php?t=1'))
    const dialog = screen.getByRole('dialog', { name: 'Добавить торрент' })
    expect(within(dialog).getByText('перехвачено на rutracker.org')).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: 'Страница раздачи' })).toHaveValue('https://rutracker.org/forum/viewtopic.php?t=1')
    mock.respond('torrent_add', 42)
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    expect(mock.calls().find(([command]) => command === 'torrent_add')?.[1]).toMatchObject({
      request: { sourceUrl: 'https://rutracker.org/forum/viewtopic.php?t=1' },
    })
  })

  it('уже в архиве, но без страницы раздачи — запись получает ссылку с трекера', async () => {
    const user = renderDialog()
    mock.respond('torrent_preview', preview({ duplicate: archiveEntry({ status: 'filesDeleted', sourceUrl: null }) }))
    await act(() => openTorrentFile('C:\\Kino\\trackers\\downloads\\2-severance.torrent', 'https://rutor.info/torrent/1'))
    await user.click(screen.getByRole('button', { name: 'Скачать снова' }))
    expect(mock.calls().filter(([command]) => command !== 'torrent_preview').slice(0, 2)).toEqual([
      ['torrent_set_source', { id: 11, url: 'https://rutor.info/torrent/1' }],
      ['torrent_download_again', { id: 11, saveDir: 'D:\\Загрузки\\Сериалы', start: true }],
    ])
  })

  it('уже в загрузках — просто показывает его там', async () => {
    const user = renderDialog()
    await open({ duplicate: archiveEntry({ status: 'inDownloads' }) })
    expect(screen.getByRole('textbox', { name: 'Папка' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Открыть в загрузках' }))
    expect(mock.calls().filter(([command]) => command !== 'torrent_preview')).toEqual([])
    expect(downloadsView.get()).toMatchObject({ tab: 'downloads', selected: 11 })
  })
})
