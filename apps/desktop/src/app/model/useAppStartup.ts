import { useToast } from '@kino/ui'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { startWindowSync } from '../../entities/app-window'
import { startLibrarySync } from '../../entities/library'
import { startPlaybackSync } from '../../entities/playback'
import { useOpenVideo } from '../../features/open-video'
import { appIpc } from '../../shared/ipc/app'
import { playerIpc } from '../../shared/ipc/player'
import { fileName, isVideoPath } from '../../shared/lib/media'

const report = (what: string) => (e: unknown) => console.error(`[app] ${what}`, e)

/** Files from the command line are opened once per process */
let launchHandled = false

/**
 * Once per app: mirror player and window state, open a file passed on the command
 * line, accept files dropped onto the window. Returns whether a drop is hovering.
 */
export function useAppStartup(): { dropping: boolean } {
  const { t } = useTranslation()
  const toast = useToast()
  const { openPath } = useOpenVideo()
  const [dropping, setDropping] = useState(false)
  // Latest openPath without re-subscribing the listeners
  const open = useRef(openPath)
  open.current = openPath

  useEffect(() => {
    const stopPlayback = startPlaybackSync()
    const stopWindow = startWindowSync()
    const stopLibrary = startLibrarySync()
    if (!launchHandled) {
      // Once per process: StrictMode runs this effect twice in development
      launchHandled = true
      appIpc
        .launchFiles()
        .then((files) => {
          const video = files.find(isVideoPath)
          if (video) return open.current(video)
        })
        .catch(report('launch files'))
    }
    return () => {
      stopPlayback()
      stopWindow()
      stopLibrary()
    }
  }, [])

  // A remembered track is missing in this episode (SPEC 3.3)
  useEffect(() => {
    const unlisten = playerIpc.onNotice((notice) => {
      if (notice.type !== 'trackNotFound') return
      const opts = { ns: 'library', wanted: notice.wanted, chosen: notice.chosen }
      const title =
        notice.track === 'sub'
          ? t('trackNotFound.sub', opts)
          : notice.chosen
            ? t('trackNotFound.audio', opts)
            : t('trackNotFound.audioNone', opts)
      toast.show({ title, duration: 6000 })
    })
    return () => {
      unlisten.then((u) => u()).catch(report('notices'))
    }
  }, [t, toast])

  useEffect(() => {
    const unlisten = appIpc.onDragDrop((phase, paths) => {
      setDropping(phase === 'over')
      if (phase !== 'drop') return
      const video = paths.find(isVideoPath)
      if (video) void open.current(video)
      else if (paths[0]) toast.show({ title: t('errors.notVideo', { name: fileName(paths[0]) }), tone: 'warning' })
    })
    return () => {
      unlisten.then((u) => u()).catch(report('drag and drop'))
    }
  }, [t, toast])

  return { dropping }
}
