/**
 * The README's screenshots (docs/screenshots), taken from the real app on the demo library —
 * not a test, skipped unless asked for:
 *
 *   bun e2e/readme/demo-media.ts D:\demo
 *   KINO_README_MEDIA=D:\demo KINO_LIBTORRENT_PYTHON=<python with libtorrent> bunx playwright test e2e/readme
 *
 * The windows stay cloaked like in the tests: the pages are shot over CDP, the player's (the
 * video is a native window) by window-shot.ps1. A download in progress comes from a libtorrent
 * seeder on the loopback. The folders show in the shots: give the demo a short path of its own
 * (`subst V: D:\demo`, then KINO_README_MEDIA=V:\); the debug build's DEV mark is hidden.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { makeTorrent } from '../fixtures/torrent'
import { expect, test, wakeControls, type Kino } from '../kino'

const MEDIA = process.env.KINO_README_MEDIA ?? ''
const PYTHON = process.env.KINO_LIBTORRENT_PYTHON ?? ''
const OUT = process.env.KINO_README_OUT ?? fileURLToPath(new URL('../../../../docs/screenshots', import.meta.url))
const SEEDER = fileURLToPath(new URL('../../scripts/libtorrent-peer.py', import.meta.url))
const WINDOW_SHOT = fileURLToPath(new URL('./window-shot.ps1', import.meta.url))
const TITLE = 'Kino v2 · dev'
const SEEDER_PORT = 41871

const series = (show: string, dots: string, ep: number) =>
  join(MEDIA, 'Сериалы', show, 'Сезон 1', `${dots}.S01E${String(ep).padStart(2, '0')}.720p.WEB-DL.mkv`)
const film = (name: string) => join(MEDIA, 'Фильмы', name)

/** What was watched, oldest first, and how far: 0.95 — to the end */
const HISTORY: [string, number][] = [
  [film('Туманность.2023.720p.WEB-DL.mkv'), 0.95],
  [series('Фрактал', 'Фрактал', 1), 0.95],
  [series('Фрактал', 'Фрактал', 2), 0.95],
  [series('Фрактал', 'Фрактал', 3), 0.27],
  [series('Глубина', 'Глубина', 1), 0.41],
  [film('Кристалл.2025.720p.WEB-DL.mkv'), 0.55],
  [film('Горизонт.2024.720p.BluRay.mkv'), 0.32],
  [series('Северное сияние', 'Северное.сияние', 1), 0.95],
  [series('Северное сияние', 'Северное.сияние', 2), 0.95],
  [series('Северное сияние', 'Северное.сияние', 3), 0.95],
  [series('Северное сияние', 'Северное.сияние', 4), 0.63],
]

test.skip(!MEDIA || !PYTHON, 'README screenshots: KINO_README_MEDIA and KINO_LIBTORRENT_PYTHON')
test.setTimeout(20 * 60_000)

const shoot = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`) })
const shootWindow = (which: 'big' | 'small', name: string) =>
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WINDOW_SHOT, TITLE, which, join(OUT, `${name}.png`)])
/** The tests' Kino listens on the loopback at a port of its own choice: Windows knows which */
const kinoPort = () =>
  Number(
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      "$p = Get-Process kino-desktop | Where-Object { $_.Path -like '*\\target\\debug\\kino-desktop.exe' } | Select-Object -First 1; " +
        "Get-NetTCPConnection -State Listen -OwningProcess $p.Id | Where-Object LocalAddress -eq '127.0.0.1' | Select-Object -First 1 -ExpandProperty LocalPort",
    ], { encoding: 'utf8' }).trim(),
  )
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: new RegExp(`^${name}`) }).click()

/** Played up to `share` of the file and paused there: the position, the viewing and a frame are saved */
async function watch(kino: Kino, path: string, share: number): Promise<void> {
  await kino.invoke('player_open', { path })
  // The state of this very file: until it loads, the snapshot still tells about the previous one
  const name = path.split(/[\\/]/).pop()
  await expect
    .poll(async () => {
      const state = await kino.snapshot()
      return state.path?.endsWith(name ?? '') && (state.duration ?? 0) > 60
    })
    .toBe(true)
  const { duration } = await kino.snapshot()
  const target = Math.round((duration ?? 0) * share)
  await kino.invoke('player_seek', { seconds: target, mode: 'absolute' })
  await expect.poll(async () => (await kino.snapshot()).position).toBeGreaterThan(target - 1)
  await new Promise((r) => setTimeout(r, 900))
  await kino.invoke('player_set_paused', { paused: true })
  await new Promise((r) => setTimeout(r, 900))
}

async function addTorrent(kino: Kino, workdir: string, path: string, saveDir: string, categoryId: number | null, page: string): Promise<number> {
  const file = join(workdir, `${path.split(/[\\/]/).pop()}.torrent`)
  writeFileSync(file, makeTorrent(path, { pieceLength: 1 << 20, comment: 'Kino demo' }))
  const { infoHash } = await kino.invoke<{ infoHash: string }>('torrent_preview', { source: { kind: 'file', path: file } })
  return kino.invoke<number>('torrent_add', { request: { infoHash, categoryId, saveDir, onlyFiles: null, sourceUrl: page, start: true } })
}

test('скриншоты для README', async ({ launch, workdir }) => {
  mkdirSync(OUT, { recursive: true })

  const kino = await launch()
  const { page } = kino
  page.setDefaultTimeout(30_000)
  await page.addStyleTag({ content: '[data-dev-badge] { display: none !important }' })
  await kino.invoke('settings_update', { patch: { autoplay: false, showAddDialog: false } })
  for (const folder of ['Сериалы', 'Фильмы']) await kino.invoke('library_add_folder', { path: join(MEDIA, folder) })
  for (const [path, share] of HISTORY) await watch(kino, path, share)
  await kino.invoke('player_stop')
  await kino.invoke('settings_update', { patch: { autoplay: true } })

  // The downloads: two seeding, one in the archive with its files, one coming from another client
  const categories = await kino.invoke<{ id: number; name: string }[]>('torrent_categories')
  const category = (name: string) => categories.find((c) => c.name === name)?.id ?? null
  const shows = category('Сериалы')
  const films = category('Фильмы') ?? (await kino.invoke<{ id: number }>('torrent_category_create', { name: 'Фильмы', folder: null })).id
  await addTorrent(kino, workdir, join(MEDIA, 'Сериалы', 'Глубина'), join(MEDIA, 'Сериалы'), shows, 'https://tracker.example/topic/48213')
  await addTorrent(kino, workdir, film('Горизонт.2024.720p.BluRay.mkv'), join(MEDIA, 'Фильмы'), films, 'https://tracker.example/topic/51877')
  const archived = await addTorrent(kino, workdir, join(MEDIA, 'Сериалы', 'Фрактал'), join(MEDIA, 'Сериалы'), shows, 'https://tracker.example/topic/39950')
  const nebula = await addTorrent(kino, workdir, film('Туманность.2023.720p.WEB-DL.mkv'), join(MEDIA, 'Фильмы'), films, 'https://tracker.example/topic/45102')
  await expect.poll(async () => (await kino.invoke<{ torrents: { state: string }[] }>('torrent_list')).torrents.filter((t) => t.state === 'seeding').length, { timeout: 120_000 }).toBe(4)
  await kino.invoke('torrent_remove', { id: archived, deleteFiles: false })
  await kino.invoke('torrent_remove', { id: nebula, deleteFiles: false })
  // «Скачан» of the checked ones: gone before the shots
  await expect(page.getByRole('status').filter({ hasText: 'скачан' })).toHaveCount(0, { timeout: 30_000 })

  const season = join(MEDIA, 'Раздача', 'Северное.сияние.S02.720p.WEB-DL')
  const seasonTorrent = join(workdir, 'season2.torrent')
  writeFileSync(seasonTorrent, makeTorrent(season, { pieceLength: 1 << 20 }))
  const seeder = spawn(PYTHON, [SEEDER, 'seed', seasonTorrent, join(MEDIA, 'Раздача'), String(SEEDER_PORT), String(kinoPort())], {
    env: { ...process.env, LT_UPLOAD_LIMIT: String(Math.round(8.6 * 1024 * 1024)) },
    stdio: 'ignore',
  })
  try {
    const downloads = join(MEDIA, 'Загрузки')
    mkdirSync(downloads, { recursive: true })
    const { infoHash } = await kino.invoke<{ infoHash: string }>('torrent_preview', { source: { kind: 'file', path: seasonTorrent } })
    await kino.invoke('torrent_add', { request: { infoHash, categoryId: shows, saveDir: downloads, onlyFiles: null, sourceUrl: 'https://tracker.example/topic/52044', start: true } })
    await expect.poll(async () => (await kino.invoke<{ downloadSpeed: number }>('torrent_list')).downloadSpeed, { timeout: 60_000 }).toBeGreaterThan(4 * 1024 * 1024)

    await nav(page, 'Загрузки')
    const row = page.getByRole('list', { name: 'Загрузки' }).getByRole('listitem').filter({ hasText: 'Северное.сияние.S02' })
    await row.click()
    const details = page.getByRole('region', { name: 'Подробности торрента' })
    await details.getByRole('tab', { name: 'Общее' }).click()
    await page.waitForTimeout(2500)
    await shoot(page, 'downloads')

    await nav(page, 'Главная')
    await page.waitForTimeout(1200)
    await shoot(page, 'home')
    await nav(page, 'Библиотека')
    await page.waitForTimeout(1200)
    await shoot(page, 'library')
    await page.getByRole('button', { name: /^Северное сияние, / }).first().click()
    await page.waitForTimeout(1200)
    await shoot(page, 'series')
    await nav(page, 'История')
    await page.waitForTimeout(1200)
    await shoot(page, 'history')
    await nav(page, 'Загрузки')
    await page.getByRole('tab', { name: /^Архив/ }).click()
    await page.waitForTimeout(1200)
    await shoot(page, 'archive')
    await page.getByRole('tab', { name: /^Загрузки/ }).click()
  } finally {
    seeder.kill()
  }

  await page.getByRole('button', { name: 'Настройки' }).click()
  await page.getByRole('navigation', { name: 'Разделы настроек' }).getByText('Загрузки').click()
  await page.waitForTimeout(1000)
  await shoot(page, 'settings')

  // The player in a fresh Kino: after a dozen quick switches its mpv may have lost the sound
  await kino.close()
  const player = await launch({ dataDir: kino.dataDir })
  const view = player.page
  view.setDefaultTimeout(30_000)
  await view.addStyleTag({ content: '[data-dev-badge] { display: none !important }' })
  await view.getByRole('button', { name: /Продолжить/ }).first().click()
  await expect.poll(async () => (await player.snapshot()).position).toBeGreaterThan(60)
  // A usual volume (the demo's sound is silence), the dub and the subtitles chosen as a person would
  await player.invoke('player_set_volume', { volume: 80 })
  const dialog = view.getByRole('dialog', { name: 'Озвучка и субтитры' })
  await wakeControls(view)
  await view.getByRole('button', { name: /Озвучка и субтитры/ }).click()
  await dialog.getByRole('listbox', { name: 'Озвучка' }).getByRole('option', { name: /Дубляж/ }).click()
  await dialog.getByRole('listbox', { name: 'Субтитры' }).getByRole('option', { name: /Русские/ }).click()
  await expect.poll(async () => (await player.snapshot()).subtitleId).not.toBeNull()
  await view.waitForTimeout(500)
  shootWindow('big', 'player-tracks')
  // A click beside it closes it (the popover's underlay takes it, the video does not pause)
  await view.mouse.click(40, 500)
  await expect(dialog).toBeHidden()
  // Paused on a line of the subtitles (they come every 12 s: 1–5.5 s and 6.5–11 s into each)
  const at = (await player.snapshot()).position
  await player.invoke('player_seek', { seconds: Math.floor(at / 12) * 12 + 3, mode: 'absolute' })
  await view.waitForTimeout(700)
  await player.invoke('player_set_paused', { paused: true })
  await wakeControls(view)
  await view.waitForTimeout(500)
  shootWindow('big', 'player')
  await player.invoke('player_set_paused', { paused: false })

  // The mini player over the main window, which went on to the downloads
  await wakeControls(view)
  await view.getByRole('button', { name: 'Мини-плеер' }).click()
  await expect.poll(() => player.invoke<boolean>('plugin:window|is_visible', { label: 'mini' }).catch(() => false)).toBe(true)
  await nav(view, 'Загрузки')
  await view.waitForTimeout(1500)
  shootWindow('big', 'mini-main')
  shootWindow('small', 'mini-window')
  rmSync(join(OUT, '.keep'), { force: true })
})
