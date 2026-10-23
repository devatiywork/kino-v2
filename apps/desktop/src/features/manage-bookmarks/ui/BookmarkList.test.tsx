import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { BookmarkList } = await import('./BookmarkList')
const { trackersStore } = await import('../../../entities/tracker')
const { useNativeLayerCovered } = await import('../../../shared/lib/nativeLayer')
const mock = await tauri

const bookmarks = [
  { id: 1, title: 'Рутрекер', url: 'https://rutracker.org/forum/index.php' },
  { id: 2, title: 'RuTor', url: 'https://www.rutor.info/' },
]

/** Says whether the trackers browser would be hidden now */
function CoverProbe() {
  return <output aria-label="native">{useNativeLayerCovered() ? 'hidden' : 'shown'}</output>
}

function renderList() {
  const onOpen = vi.fn()
  render(
    <>
      <BookmarkList onOpen={onOpen} />
      <CoverProbe />
    </>,
  )
  return { user: userEvent.setup(), onOpen }
}

const menuOf = (title: string) => screen.getByRole('button', { name: `Действия с закладкой ${title}` })

describe('BookmarkList (integration)', () => {
  beforeEach(() => {
    mock.reset()
    act(() => trackersStore.set({ bookmarks, current: 2 }))
    mock.respond('tracker_bookmarks', bookmarks)
  })

  it('закладки с адресом сайта; текущая отмечена; клик открывает сайт', async () => {
    const { user, onOpen } = renderList()
    const nav = screen.getByRole('navigation', { name: 'Закладки трекеров' })
    expect(within(nav).getAllByRole('listitem')).toHaveLength(2)
    expect(within(nav).getByText('rutor.info')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^RuTor/ })).toHaveAttribute('aria-current', 'true')
    await user.click(within(nav).getByRole('button', { name: /^Рутрекер/ }))
    expect(onOpen).toHaveBeenCalledWith(bookmarks[0])
  })

  it('новый трекер: хватит адреса, сохранённый сразу открывается; диалог прячет страницу сайта', async () => {
    const { user, onOpen } = renderList()
    await user.click(screen.getByRole('button', { name: 'Добавить трекер' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый трекер' })
    expect(screen.getByRole('status', { name: 'native', hidden: true })).toHaveTextContent('hidden')
    expect(within(dialog).getByRole('button', { name: 'Добавить' })).toBeDisabled()

    const created = { id: 3, title: 'kinozal.tv', url: 'https://kinozal.tv/' }
    mock.respond('tracker_bookmark_create', created)
    await user.type(within(dialog).getByRole('textbox', { name: 'Адрес' }), 'kinozal.tv')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))

    expect(mock.calls()).toContainEqual(['tracker_bookmark_create', { title: '', url: 'kinozal.tv' }])
    expect(mock.calls().at(-1)).toEqual(['tracker_bookmarks', undefined])
    expect(onOpen).toHaveBeenCalledWith(created)
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('status', { name: 'native', hidden: true })).toHaveTextContent('shown')
  })

  it('ядро отвергло адрес — ошибка у поля, диалог остаётся', async () => {
    const { user, onOpen } = renderList()
    await user.click(screen.getByRole('button', { name: 'Добавить трекер' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый трекер' })
    mock.invoke.mockImplementationOnce(async () => {
      throw 'только http и https'
    })
    await user.type(within(dialog).getByRole('textbox', { name: 'Адрес' }), 'ftp://old.example')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    expect(await within(dialog).findByText('только http и https')).toBeInTheDocument()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('«Изменить» — те же поля с текущими значениями', async () => {
    const { user, onOpen } = renderList()
    await user.click(menuOf('Рутрекер'))
    await user.click(screen.getByRole('menuitem', { name: 'Изменить' }))
    const dialog = screen.getByRole('dialog', { name: 'Трекер «Рутрекер»' })
    const title = within(dialog).getByRole('textbox', { name: 'Название' })
    expect(within(dialog).getByRole('textbox', { name: 'Адрес' })).toHaveValue('https://rutracker.org/forum/index.php')
    await user.clear(title)
    await user.type(title, 'RuTracker')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(mock.calls()).toContainEqual(['tracker_bookmark_update', { id: 1, title: 'RuTracker', url: 'https://rutracker.org/forum/index.php' }])
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('«Выше» у первой недоступно, «Ниже» двигает закладку', async () => {
    const { user } = renderList()
    await user.click(menuOf('Рутрекер'))
    expect(screen.getByRole('menuitem', { name: 'Выше' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('menuitem', { name: 'Ниже' }))
    await vi.waitFor(() => expect(mock.calls()).toEqual([['tracker_bookmark_move', { id: 1, step: 1 }], ['tracker_bookmarks', undefined]]))
  })

  it('удаление — только после подтверждения', async () => {
    const { user } = renderList()
    await user.click(menuOf('RuTor'))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }))
    expect(screen.getByRole('alertdialog', { name: 'Удалить «RuTor»?' })).toHaveTextContent('Вход на сайт и архив торрентов останутся')
    expect(screen.getByRole('status', { name: 'native', hidden: true })).toHaveTextContent('hidden')
    expect(mock.calls()).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Удалить закладку' }))
    await vi.waitFor(() => expect(mock.calls()).toEqual([['tracker_bookmark_delete', { id: 2 }], ['tracker_bookmarks', undefined]]))
  })
})
