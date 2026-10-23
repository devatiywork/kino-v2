import { vi } from 'vitest'

type Handler = (event: { payload: unknown }) => void

/**
 * Stand-in for the Tauri bridge: records commands, lets a test answer them and fire
 * core events. Wire it with vi.mock in the test file (see actions.test.ts).
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
  return {
    invoke,
    listen,
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
