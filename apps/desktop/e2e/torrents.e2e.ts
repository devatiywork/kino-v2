import type { Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { magnetOf, makeTorrent } from './fixtures/torrent'
import { expect, FILM, test, type Kino } from './kino'

/** The test film already downloaded into `<workdir>\downloads` and its .torrent next to it */
function filmTorrent(workdir: string): { torrent: string; film: string; folder: string } {
  const folder = join(workdir, 'downloads')
  mkdirSync(folder, { recursive: true })
  const film = join(folder, 'Film.2014.mkv')
  copyFileSync(FILM, film)
  const torrent = join(workdir, 'Film.2014.torrent')
  writeFileSync(torrent, makeTorrent(film))
  return { torrent, film, folder }
}

/** The add dialog opened by the .torrent on the command line: into that folder, with a release page */
async function addFromDialog(page: Page, folder: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Добавить торрент' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Папка' }).fill(folder)
  await dialog.getByRole('textbox', { name: 'Страница раздачи' }).fill('https://rutor.info/torrent/1001')
  await dialog.getByRole('button', { name: 'Добавить' }).click()
}

const row = (page: Page, name: string) => page.getByRole('list', { name: 'Загрузки' }).getByRole('listitem').filter({ hasText: name })
const record = (page: Page, name: string) => page.getByRole('list', { name: 'Архив' }).getByRole('listitem').filter({ hasText: name })

async function menu(page: Page, of: ReturnType<typeof row>, button: string, item: string): Promise<void> {
  await of.getByRole('button', { name: button }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

const tab = (kino: Kino, name: 'Загрузки' | 'Архив') => kino.page.getByRole('tab', { name: new RegExp(`^${name}`) }).click()

test.describe('торренты', () => {
  test('.torrent из Проводника: окно добавления, раздача уже скачанного, «Смотреть»', async ({ launch, workdir }) => {
    const { torrent, folder } = filmTorrent(workdir)
    const kino = await launch({ file: torrent })
    const { page } = kino
    await expect(page.getByRole('dialog').getByText('Film.2014.mkv').first()).toBeVisible()
    await addFromDialog(page, folder)

    await expect(page.getByText('Добавлено в «Сериалы» и сохранено в архиве вместе со ссылкой на раздачу')).toBeVisible()
    // The file is already in place: checked, not downloaded — and seeded
    await expect(row(page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible()
    const details = page.getByRole('region', { name: 'Подробности торрента' })
    await expect(details).toBeVisible()
    await details.getByRole('tab', { name: /Файлы/ }).click()
    await expect(details.getByText('100%')).toBeVisible()

    await row(page, 'Film.2014.mkv').getByRole('button', { name: 'Смотреть' }).click()
    await expect.poll(kino.playing).toBe('Film.2014.mkv')
  })

  test('убрать из загрузок, снова раздавать, удалить с файлами, скачать снова — запись одна', async ({ launch, workdir }) => {
    const { torrent, film, folder } = filmTorrent(workdir)
    const kino = await launch({ file: torrent })
    const { page } = kino
    await addFromDialog(page, folder)
    await expect(row(page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible()

    await menu(page, row(page, 'Film.2014.mkv'), 'Действия с торрентом', 'Убрать из загрузок')
    await expect(page.getByText('Убрано из загрузок. Файлы на месте, запись осталась в архиве')).toBeVisible()
    await tab(kino, 'Архив')
    await expect(record(page, 'Film.2014.mkv').getByText('Файлы на диске')).toBeVisible()
    await expect(record(page, 'Film.2014.mkv').getByRole('button', { name: /rutor\.info/ })).toBeVisible()

    await menu(page, record(page, 'Film.2014.mkv'), 'Действия с записью', 'Снова раздавать')
    await expect(row(page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible()

    await menu(page, row(page, 'Film.2014.mkv'), 'Действия с торрентом', 'Удалить с файлами')
    await page.getByRole('alertdialog', { name: 'Удалить файлы?' }).getByRole('button', { name: 'Удалить файлы' }).click()
    await expect.poll(() => existsSync(film)).toBe(false)
    await tab(kino, 'Архив')
    await expect(record(page, 'Film.2014.mkv').getByText('Файлы удалены')).toBeVisible()

    await record(page, 'Film.2014.mkv').getByRole('button', { name: 'Скачать снова' }).click()
    // No peers offline: back in the downloads, waiting to download
    await expect(row(page, 'Film.2014.mkv').getByText('Загрузка')).toBeVisible()
    expect(await kino.invoke<unknown[]>('torrent_archive', { query: '' })).toHaveLength(1)
  })

  test('тот же торрент ещё раз — «Уже в архиве»; после перезапуска он раздаётся дальше', async ({ launch, workdir }) => {
    const { torrent, folder } = filmTorrent(workdir)
    const first = await launch({ file: torrent })
    await addFromDialog(first.page, folder)
    await expect(row(first.page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible()
    await first.close()

    const again = await launch({ file: torrent, dataDir: first.dataDir })
    const dialog = again.page.getByRole('dialog', { name: 'Этот торрент уже в архиве' })
    await expect(dialog.getByRole('status')).toContainText('Уже в архиве · Сериалы')
    await dialog.getByRole('button', { name: 'Открыть в загрузках' }).click()
    await expect(row(again.page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible()
    expect(await again.invoke<unknown[]>('torrent_archive', { query: '' })).toHaveLength(1)
  })

  test('magnet-ссылка торрента из архива узнаётся без сети', async ({ launch, workdir }) => {
    const { torrent, folder } = filmTorrent(workdir)
    const kino = await launch({ file: torrent })
    const { page } = kino
    await addFromDialog(page, folder)
    await expect(row(page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible()
    const [entry] = await kino.invoke<{ id: number }[]>('torrent_archive', { query: '' })
    const magnet = await kino.invoke<string>('torrent_magnet', { id: entry?.id })

    await page.getByRole('button', { name: 'Magnet-ссылка' }).click()
    await page.getByRole('textbox', { name: 'Magnet-ссылка' }).fill(magnet)
    await page.getByRole('button', { name: 'Продолжить' }).click()
    await expect(page.getByRole('dialog', { name: 'Этот торрент уже в архиве' })).toBeVisible()
  })

  test('«Не раздавать после загрузки» — скачанный торрент сразу уходит в архив', async ({ launch, workdir }) => {
    const { torrent, folder } = filmTorrent(workdir)
    const setup = await launch()
    await setup.invoke('settings_update', { patch: { noSeeding: true } })
    await setup.close()

    const kino = await launch({ file: torrent, dataDir: setup.dataDir })
    const { page } = kino
    await addFromDialog(page, folder)
    await expect(page.getByText('«Film.2014.mkv» скачан и убран в архив — файлы на месте')).toBeVisible()
    await expect(page.getByText('Сейчас ничего не качается.')).toBeVisible()
    await tab(kino, 'Архив')
    await expect(record(page, 'Film.2014.mkv').getByText('Файлы на диске')).toBeVisible()
  })

  test('без окна добавления: сразу в загрузки, .torrent удалён; очередь, свои и объединённые трекеры, альтернативные лимиты', async ({ launch, workdir }) => {
    // Two files that are nowhere in the downloads: offline they wait for peers all the time
    const src = join(workdir, 'src')
    const out = join(workdir, 'out')
    mkdirSync(src)
    const torrents = ['One', 'Two'].map((name, n) => {
      const file = join(src, `${name}.mkv`)
      writeFileSync(file, Buffer.alloc(300_000, n + 1))
      const torrent = join(workdir, `${name}.torrent`)
      writeFileSync(torrent, makeTorrent(file))
      return torrent
    })
    const tracker = 'udp://tracker.example:6969/announce'
    const setup = await launch()
    await setup.invoke('settings_update', {
      patch: { showAddDialog: false, deleteTorrentFile: true, maxActiveDownloads: 1, downloadsFolder: out, extraTrackers: tracker },
    })
    await setup.close()

    const kino = await launch({ file: torrents[0], dataDir: setup.dataDir })
    const { page } = kino
    await expect(page.getByText('Добавлено в «Сериалы» и сохранено в архиве')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => existsSync(torrents[0] as string)).toBe(false)
    await expect(row(page, 'One.mkv').getByText('Загрузка')).toBeVisible()

    // The second one — as the add dialog would send it: it waits for the first
    const preview = await kino.invoke<{ infoHash: string }>('torrent_preview', { source: { kind: 'file', path: torrents[1] } })
    await kino.invoke('torrent_add', { request: { infoHash: preview.infoHash, categoryId: null, saveDir: out, onlyFiles: null, sourceUrl: null, start: true } })
    await expect(row(page, 'Two.mkv').getByText('В очереди')).toBeVisible()

    // Added — and selected: its details are open
    const details = page.getByRole('region', { name: 'Подробности торрента' })
    await expect(details.getByText('One.mkv').first()).toBeVisible()
    await details.getByRole('tab', { name: /^Трекеры/ }).click()
    await expect(details.getByText(tracker)).toBeVisible()

    await page.getByRole('button', { name: 'Альтернативные лимиты' }).click()
    await expect(page.getByRole('button', { name: 'Альтернативные лимиты' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await kino.settings()).altLimitsOn).toBe(true)

    // The same torrent again, from a magnet link with another tracker: it joins the record
    const other = 'udp://other.example:1337/announce'
    await page.getByRole('button', { name: 'Magnet-ссылка' }).click()
    await page.getByRole('textbox', { name: 'Magnet-ссылка' }).fill(`${magnetOf(join(src, 'One.mkv'))}&tr=${encodeURIComponent(other)}`)
    await page.getByRole('button', { name: 'Продолжить' }).click()
    const known = page.getByRole('dialog', { name: 'Этот торрент уже в архиве' })
    await expect(known.getByRole('status')).toContainText('Добавлен 1 новый трекер — раздача получит его при следующем запуске Kino.')
    await known.getByRole('button', { name: 'Открыть в загрузках' }).click()
    await details.getByRole('tab', { name: /^Трекеры/ }).click()
    await expect(details.getByText(other)).toBeVisible()

    // The first one paused by hand: the queue lets the second one go
    await row(page, 'One.mkv').getByRole('button', { name: 'Пауза' }).click()
    await expect(row(page, 'Two.mkv').getByText('Загрузка')).toBeVisible()
    await expect(row(page, 'One.mkv').getByText('Пауза')).toBeVisible()
  })

  test('категории: создать, переименовать, удалить — торренты не теряются', async ({ launch }) => {
    const kino = await launch()
    const { page } = kino
    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Загрузки' }).click()
    const bar = page.getByRole('group', { name: 'Категории' })
    await bar.getByRole('button', { name: /Новая категория/ }).click()
    const create = page.getByRole('dialog', { name: 'Новая категория' })
    await create.getByRole('textbox', { name: 'Название' }).fill('Фильмы')
    await create.getByRole('button', { name: 'Создать' }).click()
    await expect(bar.getByRole('button', { name: /^Фильмы/ })).toBeVisible()

    await bar.getByRole('button', { name: /^Фильмы/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Изменить' }).click()
    const edit = page.getByRole('dialog', { name: 'Категория «Фильмы»' })
    await edit.getByRole('textbox', { name: 'Название' }).fill('Кино')
    await edit.getByRole('button', { name: 'Сохранить' }).click()
    await expect(bar.getByRole('button', { name: /^Кино/ })).toBeVisible()

    await bar.getByRole('button', { name: /^Кино/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Удалить категорию' }).click()
    await page.getByRole('alertdialog', { name: 'Удалить «Кино»?' }).getByRole('button', { name: 'Удалить категорию' }).click()
    await expect(bar.getByRole('button', { name: /^Кино/ })).toHaveCount(0)
    expect(await kino.invoke<{ name: string }[]>('torrent_categories')).toHaveLength(3)
  })

  test('резервная копия переносит архив в чистый Kino; фильтр по датам', async ({ launch, workdir }) => {
    const { torrent, folder } = filmTorrent(workdir)
    const home = await launch({ file: torrent })
    await addFromDialog(home.page, folder)
    await expect(row(home.page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible()
    // The system «Save as» dialog is not the page's: the menu's command goes in directly
    const backup = join(workdir, 'kino-archive.json')
    expect(await home.invoke('torrent_export_archive', { path: backup })).toBe(1)
    await home.close()

    // Another computer: an empty archive gets the record, its category and its release page
    const laptop = await launch()
    const { page } = laptop
    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Загрузки' }).click()
    await tab(laptop, 'Архив')
    await expect(page.getByText('Архив пока пуст', { exact: false })).toBeVisible()
    expect(await laptop.invoke('torrent_restore_archive', { path: backup })).toEqual({ added: 1, skipped: 0, broken: 0 })
    const restored = record(page, 'Film.2014.mkv')
    await expect(restored).toBeVisible()
    await expect(restored.getByRole('button', { name: /rutor\.info/ })).toBeVisible()
    expect(await laptop.invoke('torrent_restore_archive', { path: backup })).toEqual({ added: 0, skipped: 1, broken: 0 })

    // By date: the spans and the years the archive has
    await page.getByRole('button', { name: /Когда добавлен/ }).click()
    const year = String(new Date().getFullYear())
    await expect(page.getByRole('option', { name: year })).toBeVisible()
    await page.getByRole('option', { name: 'За неделю' }).click()
    await expect(restored).toBeVisible()
    await expect(page.getByRole('button', { name: 'Резервная копия' })).toBeVisible()
  })

  test('закрытие окна при раздаче — Kino уходит в трей и раздаёт дальше; без раздач — закрывается', async ({ launch, workdir }) => {
    const { torrent, folder } = filmTorrent(workdir)
    const kino = await launch({ file: torrent })
    const { page } = kino
    await addFromDialog(page, folder)
    await expect(row(page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible()

    await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await expect.poll(() => kino.invoke<boolean>('plugin:window|is_visible', { label: 'main' })).toBe(false)
    // Still running and seeding
    await expect.poll(async () => (await kino.invoke<{ torrents: { state: string }[] }>('torrent_list')).torrents[0]?.state).toBe('seeding')

    // Nothing at work: closing quits
    await kino.invoke('torrent_pause_all', { paused: true })
    const closed = page.waitForEvent('close', { timeout: 15_000 })
    await kino.invoke('plugin:window|close', { label: 'main' }).catch(() => undefined)
    await closed
  })

  test('закрытие из полноэкранного плеера — в трей; повторный запуск возвращает окно с прежним экраном, а не пустой плеер', async ({ launch, workdir }) => {
    const { torrent, folder } = filmTorrent(workdir)
    const kino = await launch({ file: torrent })
    const { page } = kino
    await addFromDialog(page, folder)
    await expect(row(page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible()
    await row(page, 'Film.2014.mkv').getByRole('button', { name: /Смотреть/ }).click()
    await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(0.5)
    const fullscreen = () => kino.invoke<boolean>('plugin:window|is_fullscreen', { label: 'main' })
    await page.keyboard.press('f')
    await expect.poll(fullscreen).toBe(true)

    // Alt+F4 over the fullscreen video: the window goes to the tray, the video stops
    await kino.invoke('plugin:window|close', { label: 'main' })
    await expect.poll(() => kino.invoke<boolean>('plugin:window|is_visible', { label: 'main' })).toBe(false)
    await expect.poll(async () => (await kino.snapshot()).idle).toBe(true)

    // Started again (or «Открыть» of the tray): a window with the downloads, not a black player
    expect(await kino.startAgain()).toBe(0)
    await expect.poll(() => kino.invoke<boolean>('plugin:window|is_visible', { label: 'main' })).toBe(true)
    expect(await fullscreen()).toBe(false)
    await expect(page.locator('html[data-video]')).not.toBeAttached()
    await expect(row(page, 'Film.2014.mkv')).toBeVisible()
  })

  test('подробности: части, трекеры, скорость; параметры — до рейтинга, проверка, перенос; правый клик', async ({ launch, workdir }) => {
    const { torrent, film, folder } = filmTorrent(workdir)
    const kino = await launch({ file: torrent })
    const { page } = kino
    await addFromDialog(page, folder)
    await expect(row(page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible()
    const details = page.getByRole('region', { name: 'Подробности торрента' })
    await expect(details.getByRole('img', { name: 'Скачано: 100%' })).toBeVisible()

    await details.getByRole('tab', { name: /^Трекеры/ }).click()
    // Offline tests: no DHT, PeX or LSD
    await expect(details.getByRole('row', { name: /DHT/ })).toContainText('выключено')
    await details.getByRole('tab', { name: 'Скорость' }).click()
    await expect(details.getByRole('img', { name: 'График скорости загрузки и отдачи' })).toBeVisible()

    await details.getByRole('tab', { name: 'Параметры' }).click()
    await details.getByRole('radio', { name: 'До рейтинга' }).click({ force: true })
    const [entry] = await kino.invoke<{ id: number }[]>('torrent_archive', { query: '' })
    await expect.poll(async () => (await kino.invoke<{ seeding: unknown }>('torrent_details', { id: entry?.id })).seeding).toEqual({ mode: 'ratio', ratio: 2 })
    await details.getByRole('button', { name: 'Проверить файлы' }).click()
    await expect(page.getByText('Файлы проверяются заново')).toBeVisible()
    await expect(row(page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible({ timeout: 30_000 })

    // «Переместить файлы…» picks the folder in a system dialog: its command goes in directly
    const moved = join(workdir, 'moved')
    mkdirSync(moved)
    await kino.invoke('app_move_torrent', { id: entry?.id, folder: moved })
    await expect.poll(() => existsSync(join(moved, 'Film.2014.mkv'))).toBe(true)
    expect(existsSync(film)).toBe(false)
    await expect(row(page, 'Film.2014.mkv').getByText('Раздача')).toBeVisible({ timeout: 30_000 })

    await row(page, 'Film.2014.mkv').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Убрать из загрузок' }).click()
    await expect(page.getByText('Убрано из загрузок. Файлы на месте, запись осталась в архиве')).toBeVisible()
  })
})
