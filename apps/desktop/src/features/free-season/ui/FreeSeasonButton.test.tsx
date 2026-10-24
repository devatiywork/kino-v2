import { ToastProvider } from '@kino/ui'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { canFreeSeason, FreeSeasonButton } = await import('./FreeSeasonButton')
const { libraryFile } = await import('../../../test/library')
const mock = await tauri

const watchedSeason = {
  season: 1,
  episodes: [libraryFile({ id: 1, watched: true }), libraryFile({ id: 2, watched: true }), libraryFile({ id: 3, watched: false, exists: false })],
}

function renderButton() {
  render(
    <ToastProvider>
      <FreeSeasonButton seriesKey="show:the sopranos" season={watchedSeason} />
    </ToastProvider>,
  )
  return userEvent.setup()
}

describe('FreeSeasonButton', () => {
  beforeEach(() => mock.reset())

  it('только для досмотренного сезона с файлами на диске', () => {
    expect(canFreeSeason(watchedSeason)).toBe(true)
    expect(canFreeSeason({ season: 1, episodes: [libraryFile({ id: 1, watched: true }), libraryFile({ id: 2, watched: false })] })).toBe(false)
    expect(canFreeSeason({ season: 1, episodes: [libraryFile({ id: 1, watched: true, exists: false })] })).toBe(false)
  })

  it('спрашивает с числом файлов, размером и раздачей, которая остановится; удаляет только после подтверждения', async () => {
    const user = renderButton()
    mock.respond('app_season_space', { files: 2, bytes: 4_831_838_208, seeding: ['The.Sopranos.S01'], failed: 0 })
    await user.click(screen.getByRole('button', { name: 'Освободить место' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Удалить файлы сезона?' })
    expect(dialog).toHaveTextContent('Сезон 1: 2 файла, 4,5 ГБ уйдут с диска')
    expect(dialog).toHaveTextContent('Раздача «The.Sopranos.S01» остановится')
    expect(mock.calls()).toEqual([['app_season_space', { key: 'show:the sopranos', season: 1 }]])

    mock.respond('app_free_season', { files: 2, bytes: 4_831_838_208, seeding: [], failed: 0 })
    await user.click(screen.getByRole('button', { name: 'Удалить файлы' }))
    expect(mock.calls().at(-1)).toEqual(['app_free_season', { key: 'show:the sopranos', season: 1 }])
    expect(await screen.findByText('Освобождено 4,5 ГБ')).toBeInTheDocument()
  })

  it('открытые в другой программе файлы — отдельное предупреждение', async () => {
    const user = renderButton()
    mock.respond('app_season_space', { files: 2, bytes: 1_000, seeding: [], failed: 0 })
    await user.click(screen.getByRole('button', { name: 'Освободить место' }))
    mock.respond('app_free_season', { files: 2, bytes: 1_000, seeding: [], failed: 1 })
    await user.click(await screen.findByRole('button', { name: 'Удалить файлы' }))
    expect(await screen.findByText(/Не удалось удалить файлов: 1/)).toBeInTheDocument()
  })
})
