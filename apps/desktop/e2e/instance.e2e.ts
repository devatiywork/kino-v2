import { expect, FILM, test } from './kino'

test.describe('одно окно', () => {
  test('второй запуск отдаёт файл уже открытому Kino и сразу выходит; свёрнутое окно возвращается', async ({ launch }) => {
    const kino = await launch()
    await kino.invoke('plugin:window|minimize', { label: 'main' })
    await expect.poll(() => kino.invoke<boolean>('plugin:window|is_minimized', { label: 'main' })).toBe(true)

    expect(await kino.startAgain(FILM)).toBe(0)
    await expect.poll(kino.playing).toBe('Film.2014.mkv')
    expect(await kino.invoke<boolean>('plugin:window|is_minimized', { label: 'main' })).toBe(false)
  })
})
