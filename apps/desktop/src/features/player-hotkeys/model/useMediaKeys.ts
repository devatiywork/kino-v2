import { useEffect } from 'react'
import { openNeighborEpisode, togglePause } from '../../../entities/playback'
import { playerIpc, type MediaKey } from '../../../shared/ipc/player'

const RUN: Record<MediaKey, () => void> = {
  togglePause,
  next: () => void openNeighborEpisode(1),
  previous: () => void openNeighborEpisode(-1),
  // «Стоп» of a keyboard: the episode stays where it is, on pause
  stop: () => void playerIpc.setPaused(true),
}

/** SPEC 6 «Медиаклавиши»: the keys of Windows' media session, also when Kino is not in front */
export function useMediaKeys(): void {
  useEffect(() => {
    const unlisten = playerIpc.onMediaKey((key) => RUN[key]())
    return () => {
      unlisten.then((u) => u()).catch((e: unknown) => console.error('[player] media keys', e))
    }
  }, [])
}
