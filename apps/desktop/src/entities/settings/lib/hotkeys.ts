/** Player actions that can be bound to another key (SPEC 3.1, 6 «Горячие клавиши») */
export const PLAYER_ACTIONS = [
  'togglePause',
  'seekBack',
  'seekForward',
  'volumeUp',
  'volumeDown',
  'toggleFullscreen',
  'toggleMute',
  'toggleSubtitles',
  'nextEpisode',
  'prevEpisode',
] as const

export type RebindableAction = (typeof PLAYER_ACTIONS)[number]
/** Escape always leaves fullscreen: it is not remapped */
export type PlayerAction = RebindableAction | 'exitFullscreen'
export type Hotkeys = Record<RebindableAction, string>

/** By KeyboardEvent.code — works the same in the Russian layout */
export const DEFAULT_HOTKEYS: Readonly<Hotkeys> = {
  togglePause: 'Space',
  seekBack: 'ArrowLeft',
  seekForward: 'ArrowRight',
  volumeUp: 'ArrowUp',
  volumeDown: 'ArrowDown',
  toggleFullscreen: 'KeyF',
  toggleMute: 'KeyM',
  toggleSubtitles: 'KeyS',
  nextEpisode: 'KeyN',
  prevEpisode: 'KeyP',
}

/** Escape leaves fullscreen and cancels, Tab moves the focus */
const RESERVED = new Set(['Escape', 'Tab'])

const isAction = (name: string): name is RebindableAction => (PLAYER_ACTIONS as readonly string[]).includes(name)

/** The keys in use: the defaults with the user's remaps (settings keep only the remaps) */
export function resolveHotkeys(overrides: Readonly<Record<string, string>>): Hotkeys {
  const hotkeys = { ...DEFAULT_HOTKEYS }
  for (const [action, code] of Object.entries(overrides)) {
    if (isAction(action) && code) hotkeys[action] = code
  }
  return hotkeys
}

/** code → action, for the key handler */
export function keymapOf(hotkeys: Readonly<Hotkeys>): Record<string, PlayerAction> {
  const keymap: Record<string, PlayerAction> = { Escape: 'exitFullscreen' }
  for (const action of PLAYER_ACTIONS) keymap[hotkeys[action]] = action
  return keymap
}

export interface PressedKey {
  code: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

export type RebindResult =
  | { ok: true; overrides: Record<string, string>; swapped: RebindableAction | null }
  | { ok: false; reason: 'reserved' | 'modifier' }

/** Only what differs from the defaults is stored */
function overridesOf(hotkeys: Hotkeys): Record<string, string> {
  return Object.fromEntries(PLAYER_ACTIONS.filter((a) => hotkeys[a] !== DEFAULT_HOTKEYS[a]).map((a) => [a, hotkeys[a]]))
}

/**
 * Binds the key to the action. The action that had this key takes the old key of this
 * one, so every key keeps a single action and no action is left without a key.
 */
export function rebind(overrides: Readonly<Record<string, string>>, action: RebindableAction, key: PressedKey): RebindResult {
  if (key.ctrlKey || key.altKey || key.metaKey) return { ok: false, reason: 'modifier' }
  if (RESERVED.has(key.code)) return { ok: false, reason: 'reserved' }
  const current = resolveHotkeys(overrides)
  const swapped = PLAYER_ACTIONS.find((a) => a !== action && current[a] === key.code) ?? null
  const next = { ...current, [action]: key.code }
  if (swapped) next[swapped] = current[action]
  return { ok: true, overrides: overridesOf(next), swapped }
}

const NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Minus: '−',
  Equal: '=',
  Backspace: '⌫',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
}

/** How a key is written in the interface: «Пробел», «←», «F», «1», «Num 5» */
export function keyLabel(code: string, spaceName: string): string {
  if (code === 'Space') return spaceName
  if (NAMES[code]) return NAMES[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
  return code
}
