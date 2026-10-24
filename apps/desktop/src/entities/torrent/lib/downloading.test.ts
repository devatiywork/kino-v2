import { describe, expect, it } from 'vitest'
import { activeTorrent } from '../../../test/torrents'
import { downloadingCount } from './downloading'

describe('downloadingCount', () => {
  it('качается и ждёт в очереди на загрузку; раздачи, пауза и ошибка — нет', () => {
    const active = [
      activeTorrent({ id: 1, state: 'downloading' }),
      activeTorrent({ id: 2, state: 'queued', progress: 0.1 }),
      // queued to seed: already downloaded
      activeTorrent({ id: 3, state: 'queued', progress: 1 }),
      activeTorrent({ id: 4, state: 'seeding', progress: 1 }),
      activeTorrent({ id: 5, state: 'paused' }),
      activeTorrent({ id: 6, state: 'error' }),
    ]
    expect(downloadingCount(active)).toBe(2)
    expect(downloadingCount([])).toBe(0)
  })
})
