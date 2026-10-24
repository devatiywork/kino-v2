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

  test('качество, вес и битрейт файла; клик по видео — пауза; мини-плеер — своё окно поверх остальных, основное свободно', async ({ launch }) => {
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
    const at = await center()
    await page.mouse.click(at.x, at.y)
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(true)
    await page.mouse.click(at.x, at.y)
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(false)

    const miniOpen = () => kino.invoke<boolean>('plugin:window|is_visible', { label: 'mini' }).catch(() => false)
    const toMini = async () => {
      await wakeControls(page)
      await page.getByRole('button', { name: 'Мини-плеер' }).click()
      await expect.poll(miniOpen).toBe(true)
      return kino.miniPage()
    }
    let mini = await toMini()
    expect(await kino.invoke<boolean>('plugin:window|is_always_on_top', { label: 'mini' })).toBe(true)
    // 320×180 is 16:9: 480×270, give or take a pixel of a scaled screen
    expect(await mini.evaluate(() => window.innerWidth)).toBe(480)
    expect(Math.abs((await mini.evaluate(() => window.innerHeight)) - 270)).toBeLessThanOrEqual(1)
    // The main window is free: the screen before the player, its sections at hand; the video plays on
    await expect(page.locator('html[data-video]')).not.toBeAttached()
    expect(await page.evaluate(() => window.innerWidth)).toBeGreaterThan(900)
    await page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: /^Загрузки/ }).click()
    await expect(page.getByText('Сейчас ничего не качается.')).toBeVisible()
    expect((await kino.snapshot()).paused).toBe(false)

    // Off the centre's play button: the picture itself
    const region = mini.getByRole('region', { name: 'Мини-плеер' })
    await mini.mouse.click(400, 200)
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(true)
    // The window heard of the pause too, as it would have by a person's second click
    await expect(region.getByRole('button', { name: 'Воспроизвести' })).toBeVisible()
    // «Развернуть» in the corner: the video back in the main window's player, as it was
    await region.getByRole('button', { name: 'Развернуть плеер' }).click()
    await expect.poll(miniOpen).toBe(false)
    await expect(page.locator('html[data-video]')).toBeAttached()
    expect((await kino.snapshot()).paused).toBe(true)

    // A double click brings it back too — two clicks, the pause as it was. Once the new window
    // knows the video is paused, as a person would see it
    mini = await toMini()
    await expect(mini.getByRole('button', { name: 'Воспроизвести' })).toBeAttached()
    await mini.mouse.dblclick(400, 200)
    await expect.poll(miniOpen).toBe(false)
    await expect(page.locator('html[data-video]')).toBeAttached()
    expect((await kino.snapshot()).paused, 'a double click is two clicks: back as it was').toBe(true)

    // ✕: the player closes, paused; the main window stays where it was
    await page.keyboard.press('Space')
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(false)
    mini = await toMini()
    await page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: 'История' }).click()
    await mini.getByRole('region', { name: 'Мини-плеер' }).hover()
    await mini.getByRole('button', { name: 'Закрыть плеер' }).click()
    await expect.poll(miniOpen).toBe(false)
    await expect.poll(async () => (await kino.snapshot()).paused).toBe(true)
    await expect(page.locator('html[data-video]')).not.toBeAttached()
    await expect(page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: 'История' })).toHaveAttribute('aria-current', 'page')
  })

  test('основное окно закрыто, мини-плеер играет дальше; «Развернуть» возвращает окно, Alt+F4 на мини-плеере — выход', async ({ launch }) => {
    const kino = await launch({ file: FILM })
    const { page } = kino
    await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(0.5)
    const visible = (label: string) => () => kino.invoke<boolean>('plugin:window|is_visible', { label }).catch(() => false)
    await wakeControls(page)
    await page.getByRole('button', { name: 'Мини-плеер' }).click()
    await expect.poll(visible('mini')).toBe(true)
    let mini = await kino.miniPage()

    // As the main window's ✕: it goes, the video plays on in the mini player
    await kino.invoke('plugin:window|close', { label: 'main' })
    await expect.poll(visible('main')).toBe(false)
    const at = (await kino.snapshot()).position
    await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(at + 0.5)
    expect(await visible('mini')()).toBe(true)

    await mini.getByRole('region', { name: 'Мини-плеер' }).hover()
    await mini.getByRole('button', { name: 'Развернуть плеер' }).click()
    await expect.poll(visible('main')).toBe(true)
    await expect(page.locator('html[data-video]')).toBeAttached()

    // Main window gone, then the mini player closed too: nothing of Kino is left — it quits
    await wakeControls(page)
    await page.getByRole('button', { name: 'Мини-плеер' }).click()
    await expect.poll(visible('mini')).toBe(true)
    mini = await kino.miniPage()
    await kino.invoke('plugin:window|close', { label: 'main' })
    await expect.poll(visible('main')).toBe(false)
    await mini.evaluate(() => (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'mini' })).catch(() => undefined)
    expect(await kino.exits(10_000)).toBe(true)
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
