import { ToastProvider } from '@kino/ui'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)
const dialog = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => dialog)

const { ArchiveBackupMenu } = await import('./ArchiveBackupMenu')
const mock = await tauri

function renderMenu() {
  render(
    <ToastProvider>
      <ArchiveBackupMenu />
    </ToastProvider>,
  )
  return userEvent.setup()
}

const choose = async (user: ReturnType<typeof userEvent.setup>, item: string) => {
  await user.click(screen.getByRole('button', { name: 'Резервная копия' }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

describe('ArchiveBackupMenu (integration)', () => {
  beforeEach(() => {
    mock.reset()
    dialog.open.mockReset()
    dialog.save.mockReset()
    mock.respond('torrent_list', { torrents: [], downloadSpeed: 0, uploadSpeed: 0 })
    mock.respond('torrent_archive', [])
    mock.respond('torrent_categories', [])
  })

  it('сохраняет копию в выбранный файл с датой в имени', async () => {
    const user = renderMenu()
    dialog.save.mockResolvedValue('D:\\Копии\\kino-archive.json')
    mock.respond('torrent_export_archive', 214)
    await choose(user, 'Сохранить копию архива…')
    expect(dialog.save.mock.calls[0]?.[0]).toMatchObject({ defaultPath: expect.stringMatching(/^kino-archive-\d{4}-\d{2}-\d{2}\.json$/) })
    expect(mock.calls()).toContainEqual(['torrent_export_archive', { path: 'D:\\Копии\\kino-archive.json' }])
    expect(await screen.findByText('Копия сохранена — торрентов в ней: 214')).toBeInTheDocument()
  })

  it('отмена выбора файла — ничего не происходит', async () => {
    const user = renderMenu()
    dialog.save.mockResolvedValue(null)
    await choose(user, 'Сохранить копию архива…')
    expect(mock.calls().some(([command]) => command === 'torrent_export_archive')).toBe(false)
  })

  it('восстанавливает недостающее и говорит, что уже было', async () => {
    const user = renderMenu()
    dialog.open.mockResolvedValue('D:\\Копии\\kino-archive.json')
    mock.respond('torrent_restore_archive', { added: 12, skipped: 202, broken: 1 })
    await choose(user, 'Восстановить из копии…')
    expect(mock.calls()).toContainEqual(['torrent_restore_archive', { path: 'D:\\Копии\\kino-archive.json' }])
    expect(await screen.findByText('Из копии добавлено торрентов: 12. Уже были в архиве: 202.')).toBeInTheDocument()
    expect(screen.getByText(/Не прочитались торренты: 1/)).toBeInTheDocument()
    expect(mock.calls()).toContainEqual(['torrent_archive', { query: '' }])
  })
})
