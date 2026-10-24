import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open, save } from '@tauri-apps/plugin-dialog'
import { VIDEO_EXTENSIONS } from '../lib/media'
import { invoke, type UnlistenFn } from './bridge'

export type DropPhase = 'over' | 'drop' | 'leave'

export const appIpc = {
  /** Files passed on the command line: "Open with Kino" in Explorer */
  launchFiles: () => invoke<string[]>('app_launch_files'),

  /** Files dragged onto the window (paths come from Tauri, HTML drag events are off) */
  onDragDrop: (handler: (phase: DropPhase, paths: string[]) => void): Promise<UnlistenFn> =>
    getCurrentWebview().onDragDropEvent((e) => {
      const p = e.payload
      if (p.type === 'drop') handler('drop', p.paths)
      else if (p.type === 'leave') handler('leave', [])
      else handler('over', p.type === 'enter' ? p.paths : [])
    }),

  /** System folder picker; null if cancelled */
  pickFolder: async (title: string): Promise<string | null> => {
    const path = await open({ title, multiple: false, directory: true })
    return typeof path === 'string' ? path : null
  },

  /** System file picker for .torrent files; null if cancelled */
  pickTorrentFile: async (title: string, filterName: string): Promise<string | null> => {
    const path = await open({ title, multiple: false, directory: false, filters: [{ name: filterName, extensions: ['torrent'] }] })
    return typeof path === 'string' ? path : null
  },

  /** A web page (a release page) in the default browser; only http(s) */
  openUrl: (url: string) => invoke<void>('app_open_url', { url }),

  /** A file or folder shown selected in Explorer */
  revealPath: (path: string) => invoke<void>('app_reveal_path', { path }),

  /** Text into the clipboard: a magnet link, a hash */
  copyText: (text: string) => navigator.clipboard.writeText(text),

  /** A backup of the archive to restore; null if cancelled */
  pickBackupFile: async (title: string, filterName: string): Promise<string | null> => {
    const path = await open({ title, multiple: false, directory: false, filters: [{ name: filterName, extensions: ['json'] }] })
    return typeof path === 'string' ? path : null
  },

  /** Where to save a backup («Сохранить как»); null if cancelled */
  pickBackupTarget: async (title: string, defaultName: string, filterName: string): Promise<string | null> =>
    save({ title, defaultPath: defaultName, filters: [{ name: filterName, extensions: ['json'] }] }),

  /** System file picker filtered to video; null if cancelled */
  pickVideoFile: async (title: string, filterName: string): Promise<string | null> => {
    const path = await open({ title, multiple: false, directory: false, filters: [{ name: filterName, extensions: [...VIDEO_EXTENSIONS] }] })
    return typeof path === 'string' ? path : null
  },
}
