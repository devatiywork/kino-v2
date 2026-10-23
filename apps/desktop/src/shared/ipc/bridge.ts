/**
 * The only place that imports the Tauri bridge for commands and events. Tests replace this
 * module (vi.mock('…/shared/ipc/bridge')) — see src/test/tauriMock.ts.
 */
export { convertFileSrc, invoke } from '@tauri-apps/api/core'
export { listen, type UnlistenFn } from '@tauri-apps/api/event'
