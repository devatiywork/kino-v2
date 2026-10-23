import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface TrackerSite {
  /** http://127.0.0.1:<port> */
  url: string
  close: () => Promise<void>
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title></head>` +
  `<body style="font:16px sans-serif;padding:24px"><h1>${title}</h1>${body}</body></html>`

/**
 * A tiny tracker on the loopback for the E2E tests: a topic with a .torrent download (sent as
 * an attachment, the way real trackers do it), a magnet link, a link to another site, a login
 * that leaves a cookie. `torrent` — the .torrent the topic gives, `magnet` — its link
 */
export async function startTrackerSite(torrent: Buffer, magnet: string): Promise<TrackerSite> {
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const loggedIn = /(^|;\s*)session=ok/.test(request.headers.cookie ?? '')
    if (url.pathname === '/dl') {
      response.writeHead(200, {
        'content-type': 'application/x-bittorrent',
        'content-disposition': 'attachment; filename="[test-tracker].t1.torrent"',
      })
      response.end(torrent)
      return
    }
    if (url.pathname === '/login') {
      response.writeHead(302, { 'set-cookie': 'session=ok; Path=/; Max-Age=31536000', location: '/' })
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    if (url.pathname === '/topic/1') {
      response.end(
        page(
          'Тестовая раздача',
          `<p><a id="dl" href="/dl">Скачать .torrent</a></p>` +
            `<p><a id="magnet" href="${magnet}">Магнет-ссылка</a></p>` +
            `<p><a id="away" href="http://127.0.0.2:9/elsewhere">Другой сайт</a></p>` +
            `<p><a id="blank" href="/topic/1?tab=new" target="_blank">Эта же раздача в новом окне</a></p>`,
        ),
      )
      return
    }
    response.end(page('Тестовый трекер', `<p id="who">${loggedIn ? 'Вы вошли' : 'Гость'}</p><p><a href="/topic/1">Раздача</a> · <a href="/login">Войти</a></p>`))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve())
        // WebView2 keeps its connections alive: without this, close waits for their timeout
        server.closeAllConnections()
      }),
  }
}
