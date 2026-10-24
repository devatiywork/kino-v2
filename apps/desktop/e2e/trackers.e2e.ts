import type { Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { magnetOf, makeTorrent } from './fixtures/torrent'
import { startTrackerSite, type TrackerSite } from './fixtures/trackerSite'
import { expect, FILM, test as kinoTest } from './kino'

/** The test tracker on the loopback: its topic gives the test film's .torrent and magnet link */
const test = kinoTest.extend<{ site: TrackerSite }>({
  // Playwright fixtures take an object pattern as the first argument
  site: async ({}, use) => {
    const site = await startTrackerSite(makeTorrent(FILM), magnetOf(FILM))
    await use(site)
    await site.close()
  },
})

const DOWNLOADED = '[test-tracker].t1.torrent'

/** A tab of the downloads screen (the details panel has a «Трекеры» tab of its own) */
const section = (page: Page, name: 'Загрузки' | 'Трекеры') =>
  page.getByRole('tablist', { name: 'Разделы загрузок' }).getByRole('tab', { name: new RegExp(`^${name}`) })

async function openTrackers(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Загрузки' }).click()
  await section(page, 'Трекеры').click()
}

/** «Добавить трекер»: a new bookmark opens its site at once */
async function addBookmark(page: Page, url: string, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Добавить трекер' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новый трекер' })
  await dialog.getByRole('textbox', { name: 'Адрес' }).fill(url)
  await dialog.getByRole('textbox', { name: 'Название' }).fill(title)
  await dialog.getByRole('button', { name: 'Добавить' }).click()
  await expect(dialog).toBeHidden()
}

/**
 * Kino cancels a magnet link's navigation, and Playwright waits for it to end before every next
 * action on the page: such a link, and the first click after it, go over a bare CDP session
 */
async function follow(tracker: Page, selector: string): Promise<void> {
  const cdp = await tracker.context().newCDPSession(tracker)
  // As a person's click: Chromium skips pages left without a user gesture when going back
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)}).click()`, userGesture: true })
  await cdp.detach()
}

const address = (page: Page) => page.getByRole('textbox', { name: 'Адрес страницы' })

test.describe('трекеры', () => {
  test('закладка открывает сайт; скачанный .torrent — в окно добавления со страницей раздачи, мимо «Загрузок» Windows', async ({ launch, site, workdir }) => {
    const kino = await launch()
    const { page } = kino
    await openTrackers(page)
    await expect(page.getByText(/Выберите трекер слева/)).toBeVisible()
    await addBookmark(page, site.url, 'Тестовый трекер')

    const tracker = await kino.webPage(site.url)
    await expect(tracker.locator('#who')).toHaveText('Гость')
    await expect(address(page)).toHaveValue(`${site.url}/`)
    await expect(page.getByRole('button', { name: /^Тестовый трекер/ })).toHaveAttribute('aria-current', 'true')
    await tracker.getByRole('link', { name: 'Раздача' }).click()
    await expect(address(page)).toHaveValue(`${site.url}/topic/1`)

    await tracker.locator('#dl').click()
    const dialog = page.getByRole('dialog', { name: 'Добавить торрент' })
    await expect(dialog.getByText(`перехвачено на ${new URL(site.url).host}`)).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Страница раздачи' })).toHaveValue(`${site.url}/topic/1`)
    await expect(page.getByText('Kino перехватил .torrent — в «Загрузки» Windows ничего не сохранено')).toBeVisible()
    await dialog.getByRole('textbox', { name: 'Папка' }).fill(join(workdir, 'downloads'))
    await dialog.getByRole('button', { name: 'Добавить' }).click()
    await expect(page.getByText('Добавлено в «Сериалы» и сохранено в архиве вместе со ссылкой на раздачу')).toBeVisible()

    const archive = await kino.invoke<{ name: string; sourceUrl: string | null }[]>('torrent_archive', { query: '' })
    expect(archive).toEqual([expect.objectContaining({ name: 'Film.2014.mkv', sourceUrl: `${site.url}/topic/1` })])
    // The browser's download went into Kino's own folder, not to the user's «Загрузки»
    expect(readdirSync(join(kino.dataDir, 'trackers', 'downloads')).some((name) => name.endsWith(DOWNLOADED))).toBe(true)
    expect(existsSync(join(homedir(), 'Downloads', DOWNLOADED))).toBe(false)
  })

  test('из окна трекеров сохраняется только .torrent: программа не качается, подделка удаляется, dl.php с торрентом открывается', async ({ launch, site }) => {
    const kino = await launch()
    const { page } = kino
    await openTrackers(page)
    await addBookmark(page, `${site.url}/topic/1`, 'Тестовый трекер')
    const tracker = await kino.webPage(site.url)
    const kept = () => readdirSync(join(kino.dataDir, 'trackers', 'downloads'))

    await tracker.locator('#ad').click()
    await expect(page.getByText('«setup.exe» не скачан: здесь Kino сохраняет только .torrent. Нужен этот файл — «Открыть в браузере»')).toBeVisible()
    expect(kept()).toEqual([])
    expect(existsSync(join(homedir(), 'Downloads', 'setup.exe'))).toBe(false)

    await tracker.locator('#fake').click()
    await expect(page.getByText('«fake.torrent» не скачан: здесь Kino сохраняет только .torrent. Нужен этот файл — «Открыть в браузере»')).toBeVisible()
    await expect.poll(kept).toEqual([])
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await tracker.locator('#script').click()
    await expect(page.getByRole('dialog', { name: 'Добавить торрент' }).getByText('Film.2014.mkv').first()).toBeVisible()
    expect(kept()).toEqual([expect.stringMatching(/^\d+-dl\.torrent$/)])
  })

  test('реклама: запрос к рекламной сети остановлен, блоки скрыты, щит считает; выключение возвращает всё', async ({ launch, site, workdir }) => {
    const list = join(workdir, 'ads.txt')
    writeFileSync(list, ['||127.0.0.2^$image', '127.0.0.1##.top-banner', '##.adsbox'].join('\n'))
    const kino = await launch({ adblockList: list })
    const { page } = kino
    await openTrackers(page)
    await addBookmark(page, `${site.url}/topic/1`, 'Тестовый трекер')
    const tracker = await kino.webPage(site.url)
    const banner = () => tracker.locator('#banner').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)
    await expect(tracker.locator('#site-ad')).toBeHidden()
    await expect(tracker.locator('#generic-ad')).toBeHidden()
    await expect.poll(banner).toBe(0)
    await expect(tracker.locator('#dl')).toBeVisible()
    const shield = page.getByRole('button', { name: 'Блокировать рекламу' })
    await expect(shield).toHaveAttribute('aria-pressed', 'true')
    await expect(shield).toHaveText('1')

    await shield.click()
    await expect(shield).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(banner).toBe(1)
    await expect(tracker.locator('#site-ad')).toBeVisible()
    await expect(tracker.locator('#generic-ad')).toBeVisible()
    expect((await kino.settings()).blockAds).toBe(false)
  })

  test('пароли: браузер трекеров предлагает их сохранять, переключатель меняет это сразу; удаление паролей не сбрасывает вход', async ({ launch, site }) => {
    const kino = await launch()
    const { page } = kino
    expect(await kino.invoke('tracker_password_saving')).toBeNull()
    await openTrackers(page)
    await addBookmark(page, site.url, 'Тестовый трекер')
    const tracker = await kino.webPage(site.url)
    await expect.poll(() => kino.invoke('tracker_password_saving')).toBe(true)
    await kino.invoke('settings_update', { patch: { savePasswords: false } })
    await expect.poll(() => kino.invoke('tracker_password_saving')).toBe(false)

    await tracker.getByRole('link', { name: 'Войти' }).click()
    await expect(tracker.locator('#who')).toHaveText('Вы вошли')
    await kino.invoke('tracker_clear_passwords')
    await tracker.reload()
    await expect(tracker.locator('#who')).toHaveText('Вы вошли')
  })

  test('страница раздачи из архива — во вкладке; magnet того же торрента — «Уже в архиве»; другой сайт — внутри, назад и вперёд между сайтами', async ({ launch, site, workdir }) => {
    // The film already in place and its .torrent from the tracker, opened as if from Explorer
    const folder = join(workdir, 'downloads')
    mkdirSync(folder, { recursive: true })
    copyFileSync(FILM, join(folder, 'Film.2014.mkv'))
    const torrent = join(workdir, 'Film.2014.torrent')
    writeFileSync(torrent, makeTorrent(join(folder, 'Film.2014.mkv')))
    const kino = await launch({ file: torrent })
    const { page } = kino
    const add = page.getByRole('dialog', { name: 'Добавить торрент' })
    await add.getByRole('textbox', { name: 'Папка' }).fill(folder)
    await add.getByRole('textbox', { name: 'Страница раздачи' }).fill(`${site.url}/topic/1`)
    await add.getByRole('button', { name: 'Добавить' }).click()
    const row = page.getByRole('list', { name: 'Загрузки' }).getByRole('listitem').filter({ hasText: 'Film.2014.mkv' })
    await expect(row.getByText('Раздача')).toBeVisible()

    await section(page, 'Трекеры').click()
    await addBookmark(page, site.url, 'Тестовый трекер')
    const tracker = await kino.webPage(site.url)
    await expect(tracker.locator('#who')).toHaveText('Гость')

    // «Открыть страницу раздачи» of a bookmarked tracker: the page opens inside Kino
    await section(page, 'Загрузки').click()
    await row.getByRole('button', { name: 'Действия с торрентом' }).click()
    await page.getByRole('menuitem', { name: 'Открыть страницу раздачи' }).click()
    await expect(section(page, 'Трекеры')).toHaveAttribute('aria-selected', 'true')
    await expect.poll(() => tracker.url()).toBe(`${site.url}/topic/1`)

    await follow(tracker, '#magnet')
    const known = page.getByRole('dialog', { name: 'Этот торрент уже в архиве' })
    await expect(known).toBeVisible()
    await expect(page.getByText('Kino перехватил magnet-ссылку')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(known).toBeHidden()

    // Another site opens right here: nothing goes to the default browser by itself
    await follow(tracker, '#away')
    await expect.poll(() => tracker.url()).toBe(`${site.otherUrl}/elsewhere`)
    await expect(tracker.locator('#where')).toHaveText('Описание фильма на другом сайте')
    await expect(address(page)).toHaveValue(`${site.otherUrl}/elsewhere`)
    // The bookmark is marked only while a page of its site is open
    await expect(page.getByRole('button', { name: /^Тестовый трекер/ })).not.toHaveAttribute('aria-current', 'true')

    // Back and forward go through the page's history, across the sites
    const back = page.getByRole('button', { name: 'Назад' })
    const forward = page.getByRole('button', { name: 'Вперёд' })
    await expect(forward).toBeDisabled()
    await back.click()
    await expect.poll(() => tracker.url()).toBe(`${site.url}/topic/1`)
    await expect(forward).toBeEnabled()
    await forward.click()
    await expect.poll(() => tracker.url()).toBe(`${site.otherUrl}/elsewhere`)
    await expect(forward).toBeDisabled()
    await back.click()
    await expect.poll(() => tracker.url()).toBe(`${site.url}/topic/1`)

    // target=_blank opens right here, not in a window of its own
    await tracker.locator('#blank').click()
    await expect.poll(() => tracker.url()).toBe(`${site.url}/topic/1?tab=new`)
    expect(tracker.context().pages().filter((p) => p.url().startsWith(site.url))).toHaveLength(1)
    expect(await kino.invoke<unknown[]>('torrent_archive', { query: '' })).toHaveLength(1)
  })

  test('у каждого трекера своя вкладка: переключение не грузит сайт заново, страница — где оставили', async ({ launch, site }) => {
    const kino = await launch()
    const { page } = kino
    await openTrackers(page)
    await addBookmark(page, site.url, 'Тестовый трекер')
    const first = await kino.webPage(site.url)
    await first.getByRole('link', { name: 'Раздача' }).click()
    await expect.poll(() => first.url()).toBe(`${site.url}/topic/1`)
    // a mark only this very page has: a reload would lose it
    await first.evaluate(() => Object.assign(window, { kinoMark: 'still here' }))

    await addBookmark(page, `${site.otherUrl}/elsewhere`, 'Другой сайт')
    const second = await kino.webPage(site.otherUrl)
    await expect(second.locator('#where')).toHaveText('Описание фильма на другом сайте')
    await expect(address(page)).toHaveValue(`${site.otherUrl}/elsewhere`)

    await page.getByRole('button', { name: /^Тестовый трекер/ }).click()
    await expect(address(page)).toHaveValue(`${site.url}/topic/1`)
    expect(await first.evaluate(() => (window as unknown as { kinoMark?: string }).kinoMark)).toBe('still here')
    await expect(page.getByRole('button', { name: /^Тестовый трекер/ })).toHaveAttribute('aria-current', 'true')

    // The shown bookmark again: its first page
    await page.getByRole('button', { name: /^Тестовый трекер/ }).click()
    await expect.poll(() => first.url()).toBe(`${site.url}/`)
    await expect(address(page)).toHaveValue(`${site.url}/`)
  })

  test('сайт не достаёт до Kino; вход на сайт и последний трекер переживают перезапуск', async ({ launch, site }) => {
    const first = await launch()
    await openTrackers(first.page)
    await addBookmark(first.page, site.url, 'Тестовый трекер')
    const tracker = await first.webPage(site.url)
    await expect(tracker.locator('#who')).toHaveText('Гость')

    const attempts = await tracker.evaluate(async () => {
      const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke: (c: string, a?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__
      if (!internals) return ['no bridge']
      const attempt = (command: string, args: Record<string, unknown>) =>
        internals.invoke(command, args).then(
          () => `${command}: allowed`,
          (e: unknown) => `${command}: ${String(e)}`,
        )
      return Promise.all([
        attempt('torrent_archive', { query: '' }),
        attempt('settings_get', {}),
        attempt('tracker_bookmarks', {}),
        attempt('plugin:event|emit', { event: 'trackers://torrent', payload: { target: 'C:\\evil.torrent', sourceUrl: null } }),
      ])
    })
    for (const result of attempts) expect(result).toMatch(/not allowed|no bridge/i)
    await expect(first.page.getByRole('dialog')).toHaveCount(0)

    await tracker.getByRole('link', { name: 'Войти' }).click()
    await expect(tracker.locator('#who')).toHaveText('Вы вошли')
    await first.close()

    const again = await launch({ dataDir: first.dataDir })
    await openTrackers(again.page)
    const back = await again.webPage(site.url)
    await expect(back.locator('#who')).toHaveText('Вы вошли')
    await expect(again.page.getByRole('button', { name: /^Тестовый трекер/ })).toHaveAttribute('aria-current', 'true')
  })

  test('закладки: переименовать, переставить, удалить — ядро помнит', async ({ launch }) => {
    const kino = await launch()
    const { page } = kino
    await openTrackers(page)
    const nav = page.getByRole('navigation', { name: 'Закладки трекеров' })

    await nav.getByRole('button', { name: 'Действия с закладкой Рутрекер' }).click()
    await page.getByRole('menuitem', { name: 'Изменить' }).click()
    const edit = page.getByRole('dialog', { name: 'Трекер «Рутрекер»' })
    await edit.getByRole('textbox', { name: 'Название' }).fill('RuTracker')
    await edit.getByRole('button', { name: 'Сохранить' }).click()

    await nav.getByRole('button', { name: 'Действия с закладкой RuTor' }).click()
    await page.getByRole('menuitem', { name: 'Выше' }).click()
    await expect(nav.getByRole('listitem').first()).toContainText('RuTor')

    await nav.getByRole('button', { name: 'Действия с закладкой RuTracker' }).click()
    await page.getByRole('menuitem', { name: 'Удалить' }).click()
    await page.getByRole('alertdialog', { name: 'Удалить «RuTracker»?' }).getByRole('button', { name: 'Удалить закладку' }).click()
    await expect(nav.getByRole('listitem')).toHaveCount(1)
    expect(await kino.invoke<{ title: string }[]>('tracker_bookmarks')).toEqual([expect.objectContaining({ title: 'RuTor', url: 'https://rutor.info/' })])
  })
})
