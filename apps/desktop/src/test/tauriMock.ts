import { vi } from 'vitest'

type Handler = (event: { payload: unknown }) => void

type Internals = { callbacks: Map<number, (event: unknown) => void>; next: number }

/**
 * The same stand-in also behind window.__TAURI_INTERNALS__: under load Vitest sometimes hands a
 * module the real bridge instead of the mocked one, and then @tauri-apps/api calls land here
 * too — the test sees every command either way
 */
function installInternals(invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>, handlers: Map<string, Handler>, convertFileSrc: (path: string) => string) {
  const internals: Internals = { callbacks: new Map(), next: 1 }
  Object.assign(window, {
    __TAURI_INTERNALS__: {
      transformCallback: (callback: (event: unknown) => void) => {
        const id = internals.next++
        internals.callbacks.set(id, callback)
        return id
      },
      unregisterCallback: (id: number) => internals.callbacks.delete(id),
      convertFileSrc,
      invoke: async (command: string, args?: Record<string, unknown>) => {
        if (command === 'plugin:event|listen') {
          const callback = internals.callbacks.get(args?.handler as number)
          handlers.set(args?.event as string, (event) => callback?.(event))
          return args?.handler
        }
        if (command === 'plugin:event|unlisten') return undefined
        return invoke(command, args && Object.keys(args).length ? args : undefined)
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => undefined },
  })
}

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
  installInternals(invoke, handlers, convertFileSrc)
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
