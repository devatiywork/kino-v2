import { invoke } from '@tauri-apps/api/core'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import { VIDEO_EXTENSIONS } from '../lib/media'

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

  /** System file picker filtered to video; null if cancelled */
  pickVideoFile: async (title: string, filterName: string): Promise<string | null> => {
    const path = await open({ title, multiple: false, directory: false, filters: [{ name: filterName, extensions: [...VIDEO_EXTENSIONS] }] })
    return typeof path === 'string' ? path : null
  },
}
