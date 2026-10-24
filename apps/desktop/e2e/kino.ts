import { test as base, chromium, expect, type Browser, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXE = fileURLToPath(new URL('../src-tauri/target/debug/kino-desktop.exe', import.meta.url))
/** Test clips (e2e/fixtures/make-media.ps1) */
export const MEDIA = fileURLToPath(new URL('./fixtures/media', import.meta.url))
export const media = (...parts: string[]) => join(MEDIA, ...parts)
export const episode = (code: string) => media('series', `Kino.Test.${code}.mkv`)
export const FILM = media('films', 'Film.2014.mkv')

/** What the tests read from the core (mirrors src/shared/ipc/player.ts) */
export interface Snapshot {
  path: string | null
  position: number
  duration: number | null
  paused: boolean
  eof: boolean
  audioId: number | null
  subtitleId: number | null
  seriesKey: string | null
  hasPrev: boolean
  hasNext: boolean
  tracks: { id: number; kind: string; title: string | null; isExternal: boolean }[]
  videoHeight: number | null
}

export interface Kino {
  page: Page
  /** Survives the app: pass it to the next launch to see the same library */
  dataDir: string
  invoke: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>
  snapshot: () => Promise<Snapshot>
  /** File name of what is playing */
  playing: () => Promise<string | null>
  /** The settings as the core keeps them (src/shared/ipc/settings.ts) */
  settings: () => Promise<Record<string, unknown>>
  /** Another page of Kino's WebView2 — the site in the trackers browser — by its address */
  webPage: (prefix: string) => Promise<Page>
  /** Kino started once more on the same data folder, as Explorer does: its exit code */
  startAgain: (...args: string[]) => Promise<number | null>
  close: () => Promise<void>
}

interface LaunchOptions {
  /** Opened as if from Explorer: kino-desktop.exe <file> */
  file?: string
  /** Reuse the data folder of an earlier launch */
  dataDir?: string
  /** Where Kino asks for its latest release instead of GitHub: the test's own server */
  updatesUrl?: string
  /** The ad blocker's rules instead of the shipped lists: a file */
  adblockList?: string
}

let port = 9400 + Math.floor(Math.random() * 400)

async function waitForCdp(url: string, deadline: number): Promise<void> {
  let last: unknown = null
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/json/version`)).ok) return
    } catch (e: unknown) {
      // not up yet — kept for the error below
      last = e
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Kino did not open CDP on ${url}: ${String(last)}`)
}

async function launch(options: LaunchOptions, owned: string[]): Promise<Kino> {
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'kino-e2e-'))
  if (!options.dataDir) owned.push(dataDir)
  port += 1
  const cdp = `http://127.0.0.1:${port}`
  const child: ChildProcess = spawn(EXE, options.file ? [options.file] : [], {
    env: {
      ...process.env,
      KINO_DATA_DIR: dataDir,
      // Out of the way: almost silent, on the Full HD monitor and without taking the focus.
      // KINO_E2E_MONITOR picks another monitor by resolution; with no match the window stays on the main one
      KINO_TEST_VOLUME: process.env.KINO_E2E_VOLUME ?? '1',
      KINO_TEST_MONITOR: process.env.KINO_E2E_MONITOR ?? '1920x1080',
      // Torrents without the network: no DHT, trackers or UPnP, loopback only — no firewall prompt
      KINO_TEST_OFFLINE: '1',
      ...(options.updatesUrl ? { KINO_UPDATES_URL: options.updatesUrl } : {}),
      ...(options.adblockList ? { KINO_ADBLOCK_LIST: options.adblockList } : {}),
      // Its own WebView2 browser: never joins another Kino, the CDP port is ours
      WEBVIEW2_USER_DATA_FOLDER: join(dataDir, 'webview2'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: 'ignore',
  })
  await waitForCdp(cdp, Date.now() + 40_000)
  const browser: Browser = await chromium.connectOverCDP(cdp)
  // Playwright takes the browser's downloads for itself: give them back, so that Kino's own
  // handler sees what the trackers browser downloads
  await (await browser.newBrowserCDPSession()).send('Browser.setDownloadBehavior', { behavior: 'default' })
  const context = browser.contexts()[0] ?? (await browser.newContext())
  const page = context.pages()[0] ?? (await context.waitForEvent('page'))
  await page.waitForFunction(() => '__TAURI_INTERNALS__' in window && document.querySelector('#root')?.childElementCount)

  const invoke = <T>(command: string, args?: Record<string, unknown>) =>
    page.evaluate(
      ([c, a]) => (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__.invoke(c, a),
      [command, args] as const,
    ) as Promise<T>
  const snapshot = () => invoke<Snapshot>('player_snapshot')

  return {
    page,
    dataDir,
    invoke,
    snapshot,
    playing: async () => (await snapshot()).path?.split(/[\\/]/).pop() ?? null,
    settings: () => invoke<Record<string, unknown>>('settings_get'),
    startAgain: (...args) =>
      new Promise((resolve, reject) => {
        const again = spawn(EXE, args, { env: { ...process.env, KINO_DATA_DIR: dataDir, KINO_TEST_OFFLINE: '1', KINO_TEST_MONITOR: process.env.KINO_E2E_MONITOR ?? '1920x1080' }, stdio: 'ignore' })
        const timer = setTimeout(() => {
          again.kill()
          reject(new Error('the second Kino did not quit'))
        }, 20_000)
        again.on('exit', (code) => {
          clearTimeout(timer)
          resolve(code)
        })
      }),
    webPage: async (prefix) => {
      const deadline = Date.now() + 15_000
      for (;;) {
        const found = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(prefix))
        if (found) return found
        if (Date.now() > deadline) throw new Error(`no page at ${prefix}`)
        await new Promise((r) => setTimeout(r, 200))
      }
    },
    close: async () => {
      await browser.close().catch((e: unknown) => console.warn('[e2e] disconnect', e))
      child.kill()
      await new Promise((r) => setTimeout(r, 800))
    },
  }
}

/**
 * `launch` starts Kino; everything started in a test is closed and its data removed after it.
 * `workdir` — a temp folder for the test's own files (downloads, .torrent), removed after Kino closes
 */
export const test = base.extend<{ launch: (options?: LaunchOptions) => Promise<Kino>; workdir: string }>({
  // Playwright fixtures take an object pattern as the first argument
  workdir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'kino-e2e-work-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  },
  // Depends on workdir: Kino is closed before the test's files go
  launch: async ({ workdir: _workdir }, use) => {
    const running: Kino[] = []
    const owned: string[] = []
    await use(async (options = {}) => {
      const kino = await launch(options, owned)
      running.push(kino)
      return kino
    })
    for (const kino of running) await kino.close()
    for (const dir of owned) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  },
})

export { expect }

/** The player hides its controls after 2.5 s: move the mouse over the window */
export async function wakeControls(page: Page): Promise<void> {
  await page.mouse.move(400, 300)
  await page.mouse.move(420, 320)
}
