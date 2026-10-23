import { useToast } from '@kino/ui'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { startWindowSync } from '../../entities/app-window'
import { startPlaybackSync } from '../../entities/playback'
import { useOpenVideo } from '../../features/open-video'
import { appIpc } from '../../shared/ipc/app'
import { fileName, isVideoPath } from '../../shared/lib/media'

const report = (what: string) => (e: unknown) => console.error(`[app] ${what}`, e)

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
    appIpc
      .launchFiles()
      .then((files) => {
        const video = files.find(isVideoPath)
        if (video) return open.current(video)
      })
      .catch(report('launch files'))
    return () => {
      stopPlayback()
      stopWindow()
    }
  }, [])

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
