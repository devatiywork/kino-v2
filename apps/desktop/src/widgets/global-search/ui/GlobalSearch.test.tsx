import { ToastProvider } from '@kino/ui'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { GlobalSearch } = await import('./GlobalSearch')
const { downloadsView, torrentsStore } = await import('../../../entities/torrent')
const { routerStore } = await import('../../../shared/lib/router')
const { libraryFile } = await import('../../../test/library')
const { seriesSummary } = await import('../../../test/series')
const { archiveEntry, categories } = await import('../../../test/torrents')
const mock = await tauri

function renderSearch() {
  render(
    <ToastProvider>
      <GlobalSearch />
    </ToastProvider>,
  )
  return userEvent.setup()
}

const found = {
  series: [seriesSummary({ key: 'show:kino test', title: 'Kino Test', watched: 1, episodes: 3 })],
  files: [libraryFile({ id: 5, seriesTitle: 'Kino Test', season: 1, episode: 2, position: 102 }), libraryFile({ id: 6, seriesTitle: null, title: 'Kino Film', episode: null, season: null, watched: true, exists: false })],
}

describe('GlobalSearch (integration)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => {
      routerStore.set({ screen: 'home', previous: 'home', seriesKey: null })
      torrentsStore.set({ categories })
      downloadsView.set({ tab: 'downloads', highlight: null, selected: null })
    })
    mock.respond('library_search', found)
    mock.respond('torrent_archive', [archiveEntry({ id: 11, status: 'filesDeleted' })])
  })

  it('Ctrl K ставит курсор в поиск; найденное — по группам', async () => {
    const user = renderSearch()
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('combobox', { name: 'Поиск' })).toHaveFocus()
    await user.keyboard('kino')
    const list = await screen.findByRole('listbox')
    expect(mock.calls()).toContainEqual(['library_search', { query: 'kino', limit: 5 }])
    expect(mock.calls()).toContainEqual(['torrent_archive', { query: 'kino' }])
    expect(within(list).getByRole('group', { name: 'Сериалы' })).toHaveTextContent('Просмотрено 1 из 3')
    const history = within(list).getByRole('group', { name: 'История' })
    expect(within(history).getAllByRole('option')[0]).toHaveTextContent('Сезон 1 · Серия 2 · остановились на 1:42')
    expect(within(history).getAllByRole('option')[1]).toHaveTextContent('файл удалён')
    expect(within(list).getByRole('group', { name: 'Архив торрентов' })).toHaveTextContent('Файлы удалены')
  })

  it('сериал открывает его страницу и очищает поле', async () => {
    const user = renderSearch()
    await user.type(screen.getByRole('combobox'), 'kino')
    const series = await screen.findByRole('group', { name: 'Сериалы' })
    await user.click(within(series).getByRole('option', { name: 'Kino Test' }))
    expect(routerStore.get()).toMatchObject({ screen: 'show', seriesKey: 'show:kino test' })
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('серия из истории — сразу в плеер', async () => {
    const user = renderSearch()
    mock.respond('player_open', { resumedFrom: 102 })
    await user.type(screen.getByRole('combobox'), 'kino')
    const history = await screen.findByRole('group', { name: 'История' })
    await user.click(within(history).getAllByRole('option')[0] as HTMLElement)
    await vi.waitFor(() => expect(mock.calls()).toContainEqual(['player_open', { path: found.files[0]?.path }]))
  })

  it('торрент из архива — запись подсвечена в архиве', async () => {
    const user = renderSearch()
    await user.type(screen.getByRole('combobox'), 'kino')
    await user.click(await screen.findByRole('option', { name: /Severance/ }))
    expect(routerStore.get().screen).toBe('downloads')
    expect(downloadsView.get()).toMatchObject({ tab: 'archive', highlight: 11, category: 'all' })
  })

  it('ничего не нашлось — так и сказано', async () => {
    mock.respond('library_search', { series: [], files: [] })
    mock.respond('torrent_archive', [])
    const user = renderSearch()
    await user.type(screen.getByRole('combobox'), 'zzz')
    expect(await screen.findByText('Ничего не найдено по запросу «zzz»')).toBeInTheDocument()
  })
})
