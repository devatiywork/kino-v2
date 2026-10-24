import { episode, expect, media, test, wakeControls, type Kino } from './kino'

/** The series folder of an opened episode is scanned in the background: wait for its neighbours */
async function neighboursKnown(kino: Kino): Promise<void> {
  await expect.poll(async () => {
    const s = await kino.snapshot()
    return s.hasPrev || s.hasNext
  }).toBe(true)
}

test.describe('сериалы', () => {
  test('папка медиатеки: сериал, сезоны и серии по порядку', async ({ launch }) => {
    const kino = await launch()
    const { page } = kino
    // The folder picker is a system dialog — the folder goes in through the same command
    await kino.invoke('library_add_folder', { path: media() })
    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Библиотека' }).click()

    const cards = page.getByRole('button', { name: /^Kino Test, / })
    await expect(cards).toHaveCount(1, { timeout: 15_000 })
    await expect(cards).toHaveAccessibleName('Kino Test, Сезон 1 · 0 из 3')
    await cards.click()

    await expect(page.getByRole('heading', { level: 1, name: 'Kino Test' })).toBeVisible()
    await expect(page.getByRole('tab')).toHaveText(['Сезон 13', 'Сезон 21'])
    await expect(page.getByRole('tabpanel').getByRole('button')).toHaveText([/Серия 1/, /Серия 2/, /Серия 3/])
    await expect(page.getByRole('button', { name: 'Серия 1', exact: true })).toBeVisible()
  })

  test('следующая серия начинается сама, в конце сезона — остановка', async ({ launch }) => {
    const kino = await launch({ file: episode('S01E02') })
    await neighboursKnown(kino)
    await kino.invoke('player_seek', { seconds: 10, mode: 'absolute' })
    await expect.poll(kino.playing, { timeout: 20_000 }).toBe('Kino.Test.S01E03.mkv')

    // the last episode of season 1: season 2 does not start by itself
    await expect.poll(async () => (await kino.snapshot()).duration).toBeGreaterThan(10)
    await kino.invoke('player_seek', { seconds: 10, mode: 'absolute' })
    await expect.poll(async () => (await kino.snapshot()).eof, { timeout: 20_000 }).toBe(true)
    await kino.page.waitForTimeout(1500)
    expect(await kino.playing()).toBe('Kino.Test.S01E03.mkv')
  })

  test('N и P листают серии, и через сезоны', async ({ launch }) => {
    const kino = await launch({ file: episode('S01E03') })
    await neighboursKnown(kino)
    await kino.page.keyboard.press('n')
    await expect.poll(kino.playing).toBe('Kino.Test.S02E01.mkv')
    await kino.page.keyboard.press('p')
    await expect.poll(kino.playing).toBe('Kino.Test.S01E03.mkv')
  })

  test('выбранные в серии озвучка и субтитры включаются в следующей', async ({ launch }) => {
    const kino = await launch({ file: episode('S01E01') })
    const { page } = kino
    await neighboursKnown(kino)
    await expect.poll(async () => (await kino.snapshot()).tracks.length).toBeGreaterThanOrEqual(4)
    await wakeControls(page)
    await page.getByRole('button', { name: /Озвучка и субтитры/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Озвучка и субтитры' })
    await dialog.getByRole('listbox', { name: 'Озвучка' }).getByRole('option', { name: /Дорожка 1/ }).click()
    await dialog.getByRole('listbox', { name: 'Субтитры' }).getByRole('option', { name: 'Выключены' }).click()
    await page.keyboard.press('Escape')

    // Without the memory mpv picks the external English dub and the .ru.srt of episode 2
    await page.keyboard.press('n')
    await expect.poll(kino.playing).toBe('Kino.Test.S01E02.mkv')
    await expect.poll(async () => {
      const s = await kino.snapshot()
      const audio = s.tracks.find((t) => t.kind === 'audio' && t.id === s.audioId)
      return { externalAudio: audio?.isExternal, subtitle: s.subtitleId }
    }).toEqual({ externalAudio: false, subtitle: null })
  })

  test('панель серий: текущая отмечена, без автовоспроизведения серия не переключается', async ({ launch }) => {
    const kino = await launch({ file: episode('S01E01') })
    const { page } = kino
    await neighboursKnown(kino)
    await wakeControls(page)
    await page.getByRole('button', { name: 'Серии', exact: true }).click()

    const panel = page.getByRole('complementary', { name: 'Серии' })
    await expect(panel.getByRole('listitem')).toHaveCount(3)
    await expect(panel.locator('[aria-current="true"]')).toHaveAccessibleName(/^Серия 1,/)

    await panel.getByRole('switch', { name: 'Автовоспроизведение' }).click({ force: true })
    // the same setting as on the settings screen
    await expect.poll(async () => (await kino.settings()).autoplay).toBe(false)
    await kino.invoke('player_seek', { seconds: 10, mode: 'absolute' })
    await expect.poll(async () => (await kino.snapshot()).eof, { timeout: 20_000 }).toBe(true)
    await page.waitForTimeout(1500)
    expect(await kino.playing()).toBe('Kino.Test.S01E01.mkv')
  })
})
