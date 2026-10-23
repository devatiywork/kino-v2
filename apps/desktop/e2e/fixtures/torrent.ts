import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'

type Bencode = number | string | Buffer | Bencode[] | { [key: string]: Bencode | undefined }

function bencode(value: Bencode): Buffer {
  if (typeof value === 'number') return Buffer.from(`i${value}e`)
  if (typeof value === 'string') return bencode(Buffer.from(value, 'utf8'))
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(`${value.length}:`), value])
  if (Array.isArray(value)) return Buffer.concat([Buffer.from('l'), ...value.map(bencode), Buffer.from('e')])
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
  return Buffer.concat([Buffer.from('d'), ...keys.flatMap((k) => [bencode(k), bencode(value[k] as Bencode)]), Buffer.from('e')])
}

function filesOf(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? filesOf(path) : [path]
    })
}

type TorrentOptions = { comment?: string; pieceLength?: number }

/**
 * A .torrent of a file or a folder, without trackers — the E2E tests never go online: Kino
 * finds the files already in place and seeds them
 */
export function makeTorrent(path: string, options: TorrentOptions = {}): Buffer {
  return bencode({ info: infoOf(path, options), comment: options.comment, 'created by': 'Kino E2E', 'creation date': 1_790_000_000 })
}

/** The magnet link of makeTorrent(path, options) — the same info hash */
export function magnetOf(path: string, options: TorrentOptions = {}): string {
  const hash = createHash('sha1').update(bencode(infoOf(path, options))).digest('hex')
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(basename(path))}`
}

function infoOf(path: string, options: TorrentOptions): Bencode {
  const pieceLength = options.pieceLength ?? 64 * 1024
  const isDir = statSync(path).isDirectory()
  const files = isDir ? filesOf(path) : [path]
  const data = Buffer.concat(files.map((f) => readFileSync(f)))
  const pieces: Buffer[] = []
  for (let offset = 0; offset < data.length; offset += pieceLength) {
    pieces.push(createHash('sha1').update(data.subarray(offset, offset + pieceLength)).digest())
  }
  return isDir
    ? {
        name: basename(path),
        'piece length': pieceLength,
        pieces: Buffer.concat(pieces),
        files: files.map((f) => ({ length: statSync(f).size, path: relative(path, f).split(sep) })),
      }
    : { name: basename(path), 'piece length': pieceLength, pieces: Buffer.concat(pieces), length: data.length }
}
