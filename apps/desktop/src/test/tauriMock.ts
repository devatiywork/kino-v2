import { vi } from 'vitest'

type Handler = (event: { payload: unknown }) => void

/**
 * Stand-in for the Tauri bridge: records commands, lets a test answer them and fire
 * core events. Wire it in the test file:
 *   const tauri = vi.hoisted(async () => (await import('…/test/tauriMock')).createTauriMock())
 *   vi.mock('…/shared/ipc/bridge', async () => (await tauri).bridge)
 */
export function createTauriMock() {
  const handlers = new Map<string, Handler>()
  const unlisten = vi.fn()
  const responses = new Map<string, unknown>()
  const invoke = vi.fn(async (command: string, _args?: Record<string, unknown>) => responses.get(command))
  const listen = vi.fn(async (event: string, handler: Handler) => {
    handlers.set(event, handler)
    return unlisten
  })
  const convertFileSrc = (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`
  return {
    invoke,
    listen,
    convertFileSrc,
    /** Stand-in for src/shared/ipc/bridge.ts */
    bridge: { invoke, listen, convertFileSrc },
    unlisten,
    respond: (command: string, value: unknown) => responses.set(command, value),
    fire: (event: string, payload: unknown) => handlers.get(event)?.({ payload }),
    /** Commands with their arguments, in call order */
    calls: () => invoke.mock.calls.map(([command, args]) => [command, args]),
    reset: () => {
      invoke.mockClear()
      listen.mockClear()
      unlisten.mockClear()
      handlers.clear()
      responses.clear()
    },
  }
}
