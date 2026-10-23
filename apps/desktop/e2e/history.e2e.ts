import { expect, FILM, test, wakeControls, type Kino } from './kino'

/** Play the film, stop at ~20 s and go back to the home screen */
async function watchUntil20(kino: Kino): Promise<void> {
  const { page } = kino
  await expect.poll(async () => (await kino.snapshot()).duration).toBeGreaterThan(70)
  await kino.invoke('player_seek', { seconds: 20, mode: 'absolute' })
  await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(20)
  await wakeControls(page)
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
}

test.describe('история и продолжение с места', () => {
  test('главная предлагает продолжить, файл продолжается с места остановки', async ({ launch }) => {
    const kino = await launch({ file: FILM })
    const { page } = kino
    await watchUntil20(kino)

    const resume = page.getByRole('button', { name: /^Продолжить с 0:2\d$/ })
    await expect(resume).toBeVisible()
    await expect(page.getByRole('region', { name: 'Сегодня' }).getByRole('button', { name: /^Film 2014, остановились на 0:2\d$/ })).toBeVisible()

    await resume.click()
    await expect(page.getByRole('status').filter({ hasText: /Продолжено с 0:2\d/ })).toBeVisible()
    expect((await kino.snapshot()).position).toBeGreaterThanOrEqual(20)
    // «Начать сначала» — back to the start
    await page.getByRole('button', { name: 'Начать сначала' }).click()
    await expect.poll(async () => (await kino.snapshot()).position).toBeLessThan(5)
  })

  test('история переживает перезапуск Kino', async ({ launch }) => {
    const first = await launch({ file: FILM })
    await watchUntil20(first)
    await expect(first.page.getByRole('button', { name: /^Продолжить с 0:2\d$/ })).toBeVisible()
    await first.close()

    const again = await launch({ dataDir: first.dataDir })
    const { page } = again
    await expect(page.getByRole('heading', { level: 1, name: 'Film 2014' })).toBeVisible()
    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'История' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'История' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Film 2014, остановились на 0:2\d$/ })).toBeVisible()
  })
})
