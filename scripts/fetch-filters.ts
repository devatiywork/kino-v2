// The ad blocker's list for the trackers browser: `bun scripts/fetch-filters.ts` before a release.
// Kino ships it inside the program and never fetches it by itself (SPEC 4.7)
import { join } from 'node:path'

const SOURCE = 'https://easylist-downloads.adblockplus.org/ruadlist+easylist.txt'
const target = join(import.meta.dir, '..', 'apps', 'desktop', 'src-tauri', 'filters', 'ruadlist+easylist.txt')

const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`${SOURCE}: ${response.status}`)
const text = await response.text()
if (!text.startsWith('[Adblock Plus')) throw new Error(`${SOURCE}: not a filter list`)
await Bun.write(target, text)
const version = /^! Version: (.+)$/m.exec(text)?.[1] ?? '?'
console.log(`ruadlist+easylist.txt: version ${version}, ${text.split('\n').length} lines`)
