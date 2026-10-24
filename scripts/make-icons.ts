// Kino's icon from its sources (apps/desktop/src-tauri/icons/source): `bun scripts/make-icons.ts`.
// The tauri CLI renders the PNGs; 16–32 px come from icon-small.svg (a thicker ring that still
// reads at that size), the rest from icon.svg. icon.ico gets them all as PNG entries
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const desktop = join(import.meta.dir, '..', 'apps', 'desktop')
const icons = join(desktop, 'src-tauri', 'icons')
const SMALL = [16, 24, 32]
const LARGE = [48, 64, 128, 256]

function render(source: string, sizes: number[], into: string): void {
  const args = ['tauri', 'icon', join(icons, 'source', source), '-o', into, ...sizes.flatMap((size) => ['-p', String(size)])]
  const run = spawnSync('bunx', args, { cwd: desktop, stdio: 'inherit', shell: true })
  if (run.status !== 0) throw new Error(`tauri icon ${source} failed`)
}

/** An .ico whose entries are PNG images (Windows Vista and later) */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

const work = mkdtempSync(join(tmpdir(), 'kino-icons-'))
try {
  render('icon-small.svg', SMALL, join(work, 'small'))
  render('icon.svg', [...LARGE, 512], join(work, 'large'))
  const png = (dir: string, size: number) => readFileSync(join(work, dir, `${size}x${size}.png`))
  const images = [...SMALL.map((size) => ({ size, png: png('small', size) })), ...LARGE.map((size) => ({ size, png: png('large', size) }))]
  writeFileSync(join(icons, 'icon.ico'), ico(images))
  copyFileSync(join(work, 'large', '512x512.png'), join(icons, 'icon.png'))
  console.log(`icon.ico: ${images.map((image) => image.size).join(', ')} px; icon.png: 512 px`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
