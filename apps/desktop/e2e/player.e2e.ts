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

  test('качество, вес и битрейт файла; клик по видео — пауза; мини-плеер поверх окон и обратно', async ({ launch }) => {
    const kino = await launch({ file: FILM })
    const { page } = kino
    await expect.poll(async () => (await kino.snapshot()).videoHeight).toBe(180)
    await wakeControls(page)
    // The test film: 320×180 H.264
    await expect(page.getByTitle('Качество, размер и средний битрейт файла')).toHaveText(/^180p · H\.264 · \d+ (кБ|МБ) · \d+ кбит\/с$/)

    const center = async () => {
      const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
      return { x: Math.round(size.w / 2), y: Math.round(size.h / 2) }
    }
    let at = await center()
    await page.mouse.click(at.x, at.y)
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(true)
    await page.mouse.click(at.x, at.y)
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(false)

    const onTop = () => kino.invoke<boolean>('plugin:window|is_always_on_top', { label: 'main' })
    const width = () => page.evaluate(() => window.innerWidth)
    await wakeControls(page)
    await page.getByRole('button', { name: 'Мини-плеер' }).click()
    await expect.poll(width).toBe(480)
    await expect.poll(onTop).toBe(true)
    const mini = page.getByRole('region', { name: 'Мини-плеер' })
    await expect(mini).toBeVisible()
    // 320×180 is 16:9: 270, give or take a pixel of a scaled screen
    expect(Math.abs((await page.evaluate(() => window.innerHeight)) - 270)).toBeLessThanOrEqual(1)

    // Off the centre's play button: the picture itself
    at = await center()
    await page.mouse.click(at.x + 60, at.y + 40)
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(true)
    // The window heard of the pause too, as it would have by a person's second click
    await expect(mini.getByRole('button', { name: 'Воспроизвести' })).toBeVisible()
    await page.mouse.dblclick(at.x + 60, at.y + 40)
    await expect.poll(width).toBeGreaterThan(900)
    await expect.poll(onTop).toBe(false)
    await expect(mini).toBeHidden()
    expect((await kino.snapshot()).paused, 'a double click is two clicks: back as it was').toBe(true)
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
