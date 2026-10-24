import { useToast } from '@kino/ui'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { startWindowSync } from '../../entities/app-window'
import { startLibrarySync } from '../../entities/library'
import { startPlaybackSync } from '../../entities/playback'
import { startSettingsSync } from '../../entities/settings'
import { startTorrentsSync } from '../../entities/torrent'
import { startTrackersSync } from '../../entities/tracker'
import { openMagnetDialog, openTorrentFile, submitMagnet } from '../../features/add-torrent'
import { useAddFolder } from '../../features/library-folders'
import { useOpenVideo } from '../../features/open-video'
import { appIpc } from '../../shared/ipc/app'
import { findMagnet, isTorrentPath } from '../../shared/ipc/torrents'
import { fileName, isVideoPath } from '../../shared/lib/media'

const report = (what: string) => (e: unknown) => console.error(`[app] ${what}`, e)

/** Files from the command line are opened once per process */
let launchHandled = false

/**
 * Once per app: mirror player, window and library state, open a file passed on the command
 * line, accept files and folders dropped onto the window. Returns whether a drop is hovering.
 */
export function useAppStartup(): { dropping: boolean } {
  const { t } = useTranslation()
  const toast = useToast()
  const { openPath } = useOpenVideo()
  const { addPath } = useAddFolder()
  const [dropping, setDropping] = useState(false)
  // Latest callbacks without re-subscribing the listeners
  const open = useRef(openPath)
  open.current = openPath
  const addFolder = useRef(addPath)
  addFolder.current = addPath

  useEffect(() => {
    const stopPlayback = startPlaybackSync()
    const stopWindow = startWindowSync()
    const stopLibrary = startLibrarySync()
    const stopSettings = startSettingsSync()
    const stopTorrents = startTorrentsSync()
    const stopTrackers = startTrackersSync()
    // SPEC 4.1: a .torrent or a magnet link opens the add dialog, a video the player
    const openGiven = async (files: string[]) => {
      const torrent = files.find(isTorrentPath)
      if (torrent) return openTorrentFile(torrent)
      const magnet = files.map(findMagnet).find((m) => m != null)
      if (magnet) {
        openMagnetDialog(magnet)
        return submitMagnet(magnet, t('magnet.invalid', { ns: 'torrents' }))
      }
      const video = files.find(isVideoPath)
      if (video) return open.current(video)
    }
    if (!launchHandled) {
      // Once per process: StrictMode runs this effect twice in development
      launchHandled = true
      appIpc.launchFiles().then(openGiven).catch(report('launch files'))
    }
    // SPEC 6 «Одно окно»: a later start of Kino hands its files here
    const stopOpen = appIpc.onOpen((files) => void openGiven(files).catch(report('open')))
    return () => {
      stopOpen.then((u) => u()).catch(report('unlisten'))
      stopPlayback()
      stopWindow()
      stopLibrary()
      stopSettings()
      stopTorrents()
      stopTrackers()
    }
  }, [])

  // SPEC 2: a video opens in the player, a folder goes to the library
  useEffect(() => {
    const unlisten = appIpc.onDragDrop((phase, paths) => {
      setDropping(phase === 'over')
      if (phase !== 'drop') return
      const torrent = paths.find(isTorrentPath)
      if (torrent) {
        openTorrentFile(torrent).catch((e: unknown) =>
          toast.show({ title: t('toast.notTorrent', { ns: 'torrents', message: String(e) }), tone: 'danger', duration: 6000 }),
        )
        return
      }
      const video = paths.find(isVideoPath)
      if (video) return void open.current(video)
      const [first] = paths
      if (!first) return
      void addFolder.current(first).then((wasFolder) => {
        if (!wasFolder) toast.show({ title: t('errors.notVideo', { name: fileName(first) }), tone: 'warning' })
      })
    })
    return () => {
      unlisten.then((u) => u()).catch(report('drag and drop'))
    }
  }, [t, toast])

  return { dropping }
}
