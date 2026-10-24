import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open, save } from '@tauri-apps/plugin-dialog'
import { VIDEO_EXTENSIONS } from '../lib/media'
import { invoke, listen, type UnlistenFn } from './bridge'

export type DropPhase = 'over' | 'drop' | 'leave'

/** What opens a kind of thing now (src-tauri/src/defaults.rs) */
export interface DefaultHandler {
  /** «Kino», «qBittorrent»; null — nothing opens it */
  name: string | null
  isKino: boolean
}

export interface DefaultHandlers {
  video: DefaultHandler
  torrent: DefaultHandler
  magnet: DefaultHandler
}

export const appIpc = {
  /** Files passed on the command line: "Open with Kino" in Explorer */
  launchFiles: () => invoke<string[]>('app_launch_files'),

  /** SPEC 6 «Одно окно»: what a later start of Kino was given (it quit, this window came forward) */
  onOpen: (handler: (files: string[]) => void): Promise<UnlistenFn> => listen<string[]>('app://open', (e) => handler(e.payload)),

  /** What Windows opens video, .torrent files and magnet links with now */
  defaultHandlers: () => invoke<DefaultHandlers>('app_default_handlers'),

  /** Windows' «Приложения по умолчанию»: only the user may choose the program there */
  openDefaultApps: () => invoke<void>('app_open_default_apps'),

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

  /** Where to save a .torrent («Сохранить как»); null if cancelled */
  pickTorrentTarget: async (title: string, defaultName: string, filterName: string): Promise<string | null> =>
    save({ title, defaultPath: defaultName, filters: [{ name: filterName, extensions: ['torrent'] }] }),

  /** Where to save a backup («Сохранить как»); null if cancelled */
  pickBackupTarget: async (title: string, defaultName: string, filterName: string): Promise<string | null> =>
    save({ title, defaultPath: defaultName, filters: [{ name: filterName, extensions: ['json'] }] }),

  /** System file picker filtered to video; null if cancelled */
  pickVideoFile: async (title: string, filterName: string): Promise<string | null> => {
    const path = await open({ title, multiple: false, directory: false, filters: [{ name: filterName, extensions: [...VIDEO_EXTENSIONS] }] })
    return typeof path === 'string' ? path : null
  },
}
