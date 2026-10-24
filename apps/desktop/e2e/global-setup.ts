import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const fixture = (path: string) => readFileSync(fileURLToPath(new URL(`./fixtures/media/${path}`, import.meta.url)))

/** The test subtitles once came out garbled (PowerShell read make-media.ps1 as ANSI): stop before the run */
function checkSubtitles(): void {
  const utf8 = ['S01E01', 'S01E02'].map((code) => fixture(`series/Kino.Test.${code}.ru.srt`).toString('utf8'))
  const cp1251 = new TextDecoder('windows-1251').decode(fixture('films/Film.2014.ru.srt'))
  if (!utf8.every((text) => text.includes('Тестовые субтитры')) || !cp1251.includes('Субтитры в кодировке Windows-1251')) {
    throw new Error('e2e/fixtures/media: the test subtitles are garbled — rerun e2e/fixtures/make-media.ps1')
  }
}

/** The tests run the debug core: build it first (a no-op when up to date) */
export default function globalSetup(): void {
  checkSubtitles()
  const manifest = fileURLToPath(new URL('../src-tauri/Cargo.toml', import.meta.url))
  // KINO_DEV_PORT: the core loads the renderer from that port (merged into tauri.conf.json)
  const port = process.env.KINO_DEV_PORT
  const env = port ? { ...process.env, TAURI_CONFIG: JSON.stringify({ build: { devUrl: `http://127.0.0.1:${port}` } }) } : process.env
  execFileSync('cargo', ['build', '--manifest-path', manifest], { stdio: 'inherit', env })
}
