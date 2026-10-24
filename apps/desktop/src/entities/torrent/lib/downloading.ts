import type { ActiveTorrent } from '../../../shared/ipc/torrents'

/** The number on «Загрузки» in the title bar: downloading or waiting in the queue to; seeds do not count */
export function downloadingCount(active: readonly ActiveTorrent[]): number {
  return active.filter((t) => t.state === 'downloading' || (t.state === 'queued' && t.progress < 1)).length
}
