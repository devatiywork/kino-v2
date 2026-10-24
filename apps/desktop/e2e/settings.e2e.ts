import type { Page } from '@playwright/test'
import { expect, FILM, media, test, wakeControls, type Kino } from './kino'

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible()
}

/** The film to ~20 s and back to the home screen: it lands in «Продолжить» and the history */
async function watchFilmUntil20(kino: Kino): Promise<void> {
  await expect.poll(async () => (await kino.snapshot()).duration).toBeGreaterThan(70)
  await kino.invoke('player_seek', { seconds: 20, mode: 'absolute' })
  await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(20)
  await wakeControls(kino.page)
  await kino.page.getByRole('button', { name: 'Назад', exact: true }).click()
}

const accent = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kino-accent').trim())

test.describe('настройки', () => {
  test('оформление, акцент и язык меняются сразу, переживают перезапуск и сбрасываются', async ({ launch }) => {
    const kino = await launch()
    const { page } = kino
    const html = page.locator('html')
    await openSettings(page)

    await page.getByRole('radio', { name: 'Светлое' }).click({ force: true })
    await expect(html).toHaveAttribute('data-theme', 'light')
    await page.getByRole('radio', { name: 'Бирюзовый' }).click({ force: true })
    await expect(html).toHaveAttribute('data-accent', 'teal')
    // the light shade of the accent (tokens.css), not the dark one
    expect(await accent(page)).toBe('#0f766e')
    await page.getByRole('radio', { name: 'English' }).click({ force: true })
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await expect(html).toHaveAttribute('lang', 'en')
    await kino.close()

    const again = await launch({ dataDir: kino.dataDir })
    const root = again.page.locator('html')
    await expect(root).toHaveAttribute('data-theme', 'light')
    await expect(root).toHaveAttribute('data-accent', 'teal')
    await expect(again.page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Home' })).toBeVisible()

    await again.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await again.page.getByRole('region', { name: 'System' }).getByRole('button', { name: 'Reset settings' }).click()
    await again.page.getByRole('alertdialog', { name: 'Reset the settings?' }).getByRole('button', { name: 'Reset' }).click()
    await expect(root).toHaveAttribute('data-theme', 'dark')
    await expect(root).toHaveAttribute('data-accent', 'blue')
    await expect(again.page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible()
  })

  test('без «Продолжать с места остановки» файл начинается сначала', async ({ launch }) => {
    const kino = await launch({ file: FILM })
    const { page } = kino
    await watchFilmUntil20(kino)
    await expect(page.getByRole('button', { name: /^Продолжить с 0:2\d$/ })).toBeVisible()

    await openSettings(page)
    await page.getByRole('switch', { name: 'Продолжать с места остановки' }).click({ force: true })
    await expect.poll(async () => (await kino.settings()).resume).toBe(false)
    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Главная' }).click()

    // the button says what will happen
    await page.getByRole('button', { name: 'Смотреть сначала' }).click()
    await expect.poll(async () => (await kino.snapshot()).position, { timeout: 10_000 }).toBeLessThan(5)
    await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(0.5)
    await expect(page.getByRole('status').filter({ hasText: /Продолжено с/ })).toHaveCount(0)
  })

  test('переназначенная клавиша сохраняется и работает в плеере', async ({ launch }) => {
    const kino = await launch()
    const { page } = kino
    await openSettings(page)
    await page.getByRole('button', { name: /^Пауза \/ воспроизведение — Пробел\./ }).click()
    await page.keyboard.press('k')
    await expect(page.getByRole('button', { name: /^Пауза \/ воспроизведение — K\./ })).toBeVisible()
    await expect.poll(async () => (await kino.settings()).hotkeys).toEqual({ togglePause: 'KeyK' })
    await kino.close()

    const again = await launch({ file: FILM, dataDir: kino.dataDir })
    await expect.poll(async () => (await again.snapshot()).position).toBeGreaterThan(0.5)
    await again.page.keyboard.press('k')
    await expect.poll(async () => (await again.snapshot()).paused).toBe(true)
    // Space is free now: nothing happens
    await again.page.keyboard.press('Space')
    await again.page.waitForTimeout(600)
    expect((await again.snapshot()).paused).toBe(true)
  })

  test('очистка истории — только после подтверждения, папки сериалов остаются', async ({ launch }) => {
    const kino = await launch({ file: FILM })
    const { page } = kino
    await watchFilmUntil20(kino)
    await kino.invoke('library_add_folder', { path: media('series') })
    await openSettings(page)
    const folders = page.getByRole('list', { name: 'Папки медиатеки' })
    await expect(folders).toContainText('series')

    const library = page.getByRole('region', { name: 'Библиотека и история' })
    await library.getByRole('button', { name: 'Очистить' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Очистить историю?' })
    await dialog.getByRole('button', { name: 'Отмена' }).click()
    expect(await kino.invoke<unknown[]>('library_history', { limit: 10 })).toHaveLength(1)

    await library.getByRole('button', { name: 'Очистить' }).click()
    await dialog.getByRole('button', { name: 'Очистить' }).click()
    await expect(page.getByText('История очищена')).toBeVisible()
    expect(await kino.invoke('library_history', { limit: 10 })).toEqual([])
    expect(await kino.invoke('library_continue_watching', { limit: 10 })).toEqual([])
    await expect(folders).toContainText('series')
  })

  test('переключатели внизу настроек не уводят страницу из окна', async ({ launch }) => {
    const kino = await launch()
    const { page } = kino
    await openSettings(page)
    await page.getByRole('navigation', { name: 'Разделы настроек' }).getByText('Загрузки').click()
    const section = page.getByRole('region', { name: 'Загрузки' })
    // The menu scrolls smoothly: the section comes to the top
    await expect.poll(async () => (await section.boundingBox())?.y).toBeLessThan(100)
    for (const name of ['Не начинать загрузку сразу', 'Не раздавать после загрузки — сразу в архив']) {
      // A person's click on the switch: the focus goes to the hidden input inside it
      const label = page.locator('label', { has: page.getByRole('switch', { name }) })
      // The section is long: the person scrolls to the switch first
      await label.scrollIntoViewIfNeeded()
      const box = await label.boundingBox()
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
      await expect(page.getByRole('switch', { name })).toBeChecked()
      await expect(section).toBeInViewport()
    }
    expect(await kino.settings()).toMatchObject({ startPaused: true, noSeeding: true })
  })
})
