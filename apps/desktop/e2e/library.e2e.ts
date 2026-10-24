import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeTorrent } from './fixtures/torrent'
import { expect, FILM, media, test } from './kino'

test.describe('библиотека', () => {
  test('сериалы, фильмы и игра с диска — по чипам; фильм открывается, у игры — «Открыть папку»', async ({ launch, workdir }) => {
    // A library folder with a film and its release's sample
    const films = join(workdir, 'films')
    mkdirSync(films, { recursive: true })
    copyFileSync(FILM, join(films, 'Film.2014.mkv'))
    copyFileSync(FILM, join(films, 'Film.2014.sample.mkv'))
    // A game: no video in it, downloaded by Kino
    const downloads = join(workdir, 'downloads')
    const game = join(downloads, 'Kino.Game')
    mkdirSync(game, { recursive: true })
    writeFileSync(join(game, 'game.bin'), Buffer.alloc(64 * 1024, 7))
    writeFileSync(join(game, 'readme.txt'), 'Kino test game')
    const torrent = join(workdir, 'Kino.Game.torrent')
    writeFileSync(torrent, makeTorrent(game))

    const kino = await launch({ file: torrent })
    const { page } = kino
    const add = page.getByRole('dialog', { name: 'Добавить торрент' })
    await add.getByText('Игры', { exact: true }).click()
    await add.getByRole('textbox', { name: 'Папка' }).fill(downloads)
    await add.getByRole('button', { name: 'Добавить' }).click()
    // The files are in place: checked, finished, seeding
    const row = page.getByRole('list', { name: 'Загрузки' }).getByRole('listitem').filter({ hasText: 'Kino.Game' })
    await expect(row.getByText('Раздача')).toBeVisible()

    // The folder picker is a system dialog — the folders go in through the same command
    await kino.invoke('library_add_folder', { path: films })
    await kino.invoke('library_add_folder', { path: media('series') })
    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Библиотека' }).click()

    const chips = page.getByRole('group', { name: 'Разделы библиотеки' }).getByRole('button')
    await expect(chips).toHaveText([/^Все\s*3$/, /^Сериалы\s*1$/, /^Фильмы\s*1$/, /^Игры\s*1$/])
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Сериалы', 'Фильмы', 'Игры'])
    await expect(page.getByRole('button', { name: /^Kino Test, / })).toBeVisible()
    // The sample is not a film of its own
    await expect(page.getByRole('button', { name: /^Film 2014/ })).toHaveAccessibleName('Film 2014, Не смотрели')

    await chips.filter({ hasText: 'Игры' }).click()
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
    const games = page.getByRole('list', { name: 'Игры' }).getByRole('listitem')
    await expect(games).toHaveCount(1)
    await expect(games).toContainText('Kino.Game')
    // Seeding, yet the library's way is the folder (not pressed: it would open the Explorer)
    await expect(games.getByRole('button', { name: 'Открыть папку' })).toBeVisible()

    await chips.filter({ hasText: 'Фильмы' }).click()
    await page.getByRole('button', { name: 'Film 2014, Не смотрели' }).click()
    await expect.poll(kino.playing).toBe('Film.2014.mkv')
  })
})
