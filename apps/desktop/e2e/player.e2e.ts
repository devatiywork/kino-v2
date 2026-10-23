import { episode, expect, FILM, test, wakeControls } from './kino'

test.describe('плеер', () => {
  test('файл из командной строки открывается в плеере и играет', async ({ launch }) => {
    const kino = await launch({ file: episode('S01E01') })
    const { page } = kino
    await expect(page.locator('html[data-video]')).toBeAttached()
    await expect(page.getByText('Kino Test', { exact: true })).toBeVisible()
    await expect(page.getByText('Сезон 1 · Серия 1')).toBeVisible()
    await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(1)
    expect(await kino.playing()).toBe('Kino.Test.S01E01.mkv')
  })

  test('пауза, перемотка и полный экран с клавиатуры', async ({ launch }) => {
    const kino = await launch({ file: FILM })
    const { page } = kino
    await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(0.5)

    await page.keyboard.press('Space')
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(true)
    const before = (await kino.snapshot()).position
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(before + 9)
    await page.keyboard.press('Space')
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(false)

    const fullscreen = () => kino.invoke<boolean>('plugin:window|is_fullscreen', { label: 'main' })
    await page.keyboard.press('f')
    await expect.poll(fullscreen).toBe(true)
    await page.keyboard.press('Escape')
    await expect.poll(fullscreen).toBe(false)
  })

  test('клик по полосе перематывает к этому месту', async ({ launch }) => {
    const kino = await launch({ file: FILM })
    const { page } = kino
    await expect.poll(async () => (await kino.snapshot()).duration).toBeGreaterThan(70)
    await wakeControls(page)
    const bar = page.getByRole('slider', { name: 'Позиция воспроизведения' })
    const box = await bar.boundingBox()
    if (!box) throw new Error('no seek bar')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    // 75 s film: the middle is ~37 s
    await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(33)
    expect((await kino.snapshot()).position).toBeLessThan(45)
  })

  test('озвучка и субтитры меняются без перезагрузки видео', async ({ launch }) => {
    const kino = await launch({ file: episode('S01E01') })
    const { page } = kino
    await expect.poll(async () => (await kino.snapshot()).tracks.length).toBeGreaterThanOrEqual(4)
    await page.keyboard.press('Space') // paused: the file must not restart
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(true)
    const position = (await kino.snapshot()).position

    await wakeControls(page)
    await page.getByRole('button', { name: /Озвучка и субтитры/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Озвучка и субтитры' })
    await dialog.getByRole('listbox', { name: 'Озвучка' }).getByRole('option', { name: /Дорожка 1/ }).click()
    await expect.poll(async () => {
      const s = await kino.snapshot()
      return s.tracks.find((t) => t.kind === 'audio' && t.id === s.audioId)?.isExternal
    }).toBe(false)

    await dialog.getByRole('listbox', { name: 'Субтитры' }).getByRole('option', { name: 'Выключены' }).click()
    await expect.poll(async () => (await kino.snapshot()).subtitleId).toBeNull()
    expect((await kino.snapshot()).position).toBeCloseTo(position, 0)
    expect(await kino.playing()).toBe('Kino.Test.S01E01.mkv')
  })
})
