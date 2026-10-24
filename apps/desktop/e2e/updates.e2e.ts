import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from './kino'

/** GitHub Releases' «latest» of a version far ahead */
async function releases(): Promise<{ url: string; server: Server }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ tag_name: 'v9.9.9', html_url: 'https://github.com/devatiywork/kino-v2/releases/tag/v9.9.9', body: 'Что нового', draft: false, prerelease: false }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/releases/latest`, server }
}

test.describe('обновления', () => {
  test('«Проверить сейчас» находит новую версию; включённая проверка говорит о ней при запуске — один раз', async ({ launch }) => {
    const { url, server } = await releases()
    try {
      const first = await launch({ updatesUrl: url })
      const { page } = first
      await page.getByRole('button', { name: 'Настройки', exact: true }).click()
      await page.getByRole('navigation', { name: 'Разделы настроек' }).getByText('Система').click()
      await page.getByRole('button', { name: 'Проверить сейчас' }).click()
      await expect(page.getByText('Вышла Kino 9.9.9')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Открыть страницу версии' })).toBeVisible()
      await first.invoke('settings_update', { patch: { checkUpdates: true } })
      await first.close()

      const again = await launch({ dataDir: first.dataDir, updatesUrl: url })
      await expect(again.page.getByText('Вышла Kino 9.9.9')).toBeVisible({ timeout: 15_000 })
      await expect(again.page.getByRole('button', { name: 'Что нового' })).toBeVisible()
      await again.close()

      const third = await launch({ dataDir: first.dataDir, updatesUrl: url })
      await third.page.waitForTimeout(3_000)
      await expect(third.page.getByText('Вышла Kino 9.9.9')).toHaveCount(0)
    } finally {
      server.close()
    }
  })
})
