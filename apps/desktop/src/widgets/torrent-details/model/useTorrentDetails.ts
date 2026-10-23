import { useCallback, useEffect, useState } from 'react'
import { torrentsIpc, type TorrentDetails } from '../../../shared/ipc/torrents'

/** Files, peers and the torrent's own data — read again every second while the panel is open */
export function useTorrentDetails(id: number): { details: TorrentDetails | null; reload: () => void } {
  const [details, setDetails] = useState<TorrentDetails | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    setDetails(null)
  }, [id])

  useEffect(() => {
    let alive = true
    const load = () =>
      torrentsIpc
        .details(id)
        .then((next) => {
          if (alive) setDetails(next)
        })
        .catch((e: unknown) => console.error('[torrents] details', e))
    void load()
    const timer = window.setInterval(() => void load(), 1000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [id, tick])

  return { details, reload }
}
