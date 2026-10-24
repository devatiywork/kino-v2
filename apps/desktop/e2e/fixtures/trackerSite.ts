import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface TrackerSite {
  /** http://127.0.0.1:<port> */
  url: string
  /** Another site the topic links to: http://127.0.0.2:<port> */
  otherUrl: string
  close: () => Promise<void>
}

/** A 1×1 PNG */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

const page = (title: string, body: string) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title></head>` +
  `<body style="font:16px sans-serif;padding:24px"><h1>${title}</h1>${body}</body></html>`

async function serve(host: string, listener: RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer(listener)
  await new Promise<void>((resolve) => server.listen(0, host, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://${host}:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve())
        // WebView2 keeps its connections alive: without this, close waits for their timeout
        server.closeAllConnections()
      }),
  }
}

/**
 * A tiny tracker on the loopback for the E2E tests: a topic with a .torrent download (sent as
 * an attachment, the way real trackers do it), a magnet link, a link to another site (a second
 * server on 127.0.0.2), a login that leaves a cookie. `torrent` — the .torrent the topic gives,
 * `magnet` — its link
 */
export async function startTrackerSite(torrent: Buffer, magnet: string): Promise<TrackerSite> {
  const other = await serve('127.0.0.2', (request, response) => {
    // An ad network's banner on the tracker's pages
    if (request.url?.startsWith('/ads/')) {
      response.writeHead(200, { 'content-type': 'image/png' })
      response.end(PIXEL)
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(page('Другой сайт', `<p id="where">Описание фильма на другом сайте</p>`))
  })
  const tracker = await serve('127.0.0.1', (request, response) => {
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
    // An ad's «download»: a program, plainly not a torrent
    if (url.pathname === '/ad/setup') {
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="setup.exe"' })
      response.end(Buffer.from('MZ this is a program'))
      return
    }
    // A .torrent behind a script whose name tells nothing (dl.php, no attachment name)
    if (url.pathname === '/dl.php') {
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment' })
      response.end(torrent)
      return
    }
    // Named a .torrent, but a page inside (a login wall, a trick)
    if (url.pathname === '/fake') {
      response.writeHead(200, { 'content-type': 'application/x-bittorrent', 'content-disposition': 'attachment; filename="fake.torrent"' })
      response.end('<html>Войдите, чтобы скачать</html>')
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
            `<p><a id="away" href="${other.url}/elsewhere">Другой сайт</a></p>` +
            `<p><a id="blank" href="/topic/1?tab=new" target="_blank">Эта же раздача в новом окне</a></p>` +
            `<img id="banner" alt="" src="${other.url}/ads/banner.png" width="10" height="10">` +
            `<div id="site-ad" class="top-banner">Реклама трекера</div><div id="generic-ad" class="adsbox">Реклама сети</div>` +
            `<p><a id="ad" href="/ad/setup">Скачать быстро (реклама)</a> · <a id="script" href="/dl.php?t=1">dl.php</a> · <a id="fake" href="/fake">Поддельный .torrent</a></p>`,
        ),
      )
      return
    }
    response.end(page('Тестовый трекер', `<p id="who">${loggedIn ? 'Вы вошли' : 'Гость'}</p><p><a href="/topic/1">Раздача</a> · <a href="/login">Войти</a></p>`))
  })
  return {
    url: tracker.url,
    otherUrl: other.url,
    close: async () => {
      await Promise.all([tracker.close(), other.close()])
    },
  }
}
