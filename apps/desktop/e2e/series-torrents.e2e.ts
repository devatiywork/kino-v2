import type { Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeTorrent } from './fixtures/torrent'
import { expect, media, test, wakeControls, type Kino } from './kino'

/** Season 1 of the test series in `<workdir>\downloads\Kino.Test.S01` (with its tracks) and its .torrent */
function seasonTorrent(workdir: string): { torrent: string; folder: string; season: string } {
  const folder = join(workdir, 'downloads')
  const season = join(folder, 'Kino.Test.S01')
  mkdirSync(season, { recursive: true })
  for (const name of readdirSync(media('series')).filter((n) => n.startsWith('Kino.Test.S01'))) {
    copyFileSync(media('series', name), join(season, name))
  }
  const torrent = join(workdir, 'Kino.Test.S01.torrent')
  writeFileSync(torrent, makeTorrent(season))
  return { torrent, folder, season }
}

/** An episode played to its end: watched */
async function watch(kino: Kino, path: string): Promise<void> {
  await kino.invoke('player_open', { path })
  // This very file is loaded (the snapshot may still be the previous one's)
  await expect
    .poll(async () => {
      const s = await kino.snapshot()
      return s.path === path && !s.eof && (s.duration ?? 0) > 10
    })
    .toBe(true)
  // The clips are about 12 s: from the 10th second it plays to the end, and the end is saved
  await kino.invoke('player_seek', { seconds: 10, mode: 'absolute' })
  await expect.poll(async () => (await kino.snapshot()).eof, { timeout: 20_000 }).toBe(true)
}

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name })

test.describe('сериал из торрента', () => {
  test('досмотренный сезон: «Освободить место», «Скачать снова»; поиск Ctrl K находит сериал, историю и торрент', async ({ launch, workdir }) => {
    const { torrent, folder, season } = seasonTorrent(workdir)
    const kino = await launch({ file: torrent })
    const { page } = kino
    await kino.invoke('settings_update', { patch: { autoplay: false } })
    const add = page.getByRole('dialog', { name: 'Добавить торрент' })
    await add.getByRole('textbox', { name: 'Папка' }).fill(folder)
    await add.getByRole('button', { name: 'Добавить' }).click()
    // The files are in place: checked, finished, seeding — and linked to the library
    const row = page.getByRole('list', { name: 'Загрузки' }).getByRole('listitem').filter({ hasText: 'Kino.Test.S01' })
    await expect(row.getByText('Раздача')).toBeVisible()

    for (const n of [1, 2, 3]) await watch(kino, join(season, `Kino.Test.S01E0${n}.mkv`))
    await kino.invoke('player_stop')
    // Out of the player, if the window switched to it
    await wakeControls(page)
    const back = page.getByRole('button', { name: 'Назад', exact: true })
    if (await back.isVisible()) await back.click()
    await expect(nav(page, 'Сериалы')).toBeVisible()
    await nav(page, 'Сериалы').click()
    const card = page.getByRole('button', { name: /^Kino Test, / })
    await expect(card).toBeVisible()
    await card.click()
    await expect(page.getByRole('heading', { level: 1, name: 'Kino Test' })).toBeVisible()

    // SPEC 3.3: the watched season leaves the disk; its torrent stops seeding first
    await page.getByRole('button', { name: 'Освободить место' }).click()
    const ask = page.getByRole('alertdialog', { name: 'Удалить файлы сезона?' })
    await expect(ask).toContainText('Сезон 1: 3 файла')
    await expect(ask).toContainText('Раздача «Kino.Test.S01» остановится')
    await ask.getByRole('button', { name: 'Удалить файлы' }).click()
    await expect(page.getByText(/^Освобождено /)).toBeVisible()
    await expect.poll(() => existsSync(join(season, 'Kino.Test.S01E01.mkv'))).toBe(false)
    expect(existsSync(join(season, 'Kino.Test.S01E01.ru.srt')), 'the episode’s tracks go with it').toBe(false)
    expect(existsSync(season), 'the torrent’s emptied folder too').toBe(false)
    const record = (await kino.invoke<{ name: string; status: string }[]>('torrent_archive', { query: '' }))[0]
    expect(record).toMatchObject({ name: 'Kino.Test.S01', status: 'filesDeleted' })

    // SPEC 5: the history stays, the torrent can bring the episodes back
    const gone = page.getByRole('region', { name: 'Удалённые серии' })
    await expect(gone).toContainText('3 серии удалены с диска')
    await expect(gone).toContainText('Торрент «Kino.Test.S01» в архиве')
    await gone.getByRole('button', { name: 'Скачать снова' }).click()
    await expect(page.getByText('«Kino.Test.S01» снова в загрузках — серии встанут на место')).toBeVisible()
    // The engine lays the files out at once: the episodes are back in place while they download
    await expect(gone).toBeHidden()
    expect((await kino.invoke<{ status: string }[]>('torrent_archive', { query: '' }))[0]?.status).toBe('inDownloads')
    await expect.poll(() => existsSync(join(season, 'Kino.Test.S01E01.mkv'))).toBe(true)

    // SPEC 2: Ctrl K from anywhere
    await page.keyboard.press('Control+k')
    const search = page.getByRole('combobox', { name: 'Поиск' })
    await expect(search).toBeFocused()
    await search.fill('kino test')
    const list = page.getByRole('listbox')
    await expect(list.getByRole('group', { name: 'Сериалы' }).getByRole('option')).toHaveCount(1)
    await expect(list.getByRole('group', { name: 'История' }).getByRole('option')).toHaveCount(3)
    await expect(list.getByRole('group', { name: 'Архив торрентов' }).getByRole('option', { name: 'Kino.Test.S01' })).toBeVisible()
    await list.getByRole('option', { name: 'Kino.Test.S01' }).click()
    await expect(page.getByRole('tab', { name: /^Загрузки/ }).first()).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('region', { name: 'Подробности торрента' })).toContainText('Kino.Test.S01')
  })
})
