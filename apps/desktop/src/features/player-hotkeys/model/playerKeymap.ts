/** Player actions bound to keys (SPEC 3.1); remapping comes with the settings screen */
export type PlayerAction =
  | 'togglePause'
  | 'seekBack'
  | 'seekForward'
  | 'volumeUp'
  | 'volumeDown'
  | 'toggleFullscreen'
  | 'exitFullscreen'
  | 'toggleMute'
  | 'toggleSubtitles'

/** By KeyboardEvent.code — works the same in the Russian layout */
export const DEFAULT_KEYMAP: Readonly<Record<string, PlayerAction>> = {
  Space: 'togglePause',
  ArrowLeft: 'seekBack',
  ArrowRight: 'seekForward',
  ArrowUp: 'volumeUp',
  ArrowDown: 'volumeDown',
  KeyF: 'toggleFullscreen',
  Escape: 'exitFullscreen',
  KeyM: 'toggleMute',
  KeyS: 'toggleSubtitles',
}

/** Inside these the keys belong to the focused widget (lists, menus, text fields) */
const OWN_KEYS = 'input, textarea, [contenteditable], [role="dialog"], [role="menu"], [role="listbox"]'
/** Sliders handle the arrows themselves */
const OWN_ARROWS = '[role="slider"]'

export interface KeyInfo {
  code: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  target: EventTarget | null
}

/** Which player action a key press means, or null if it is not the player's */
export function resolvePlayerKey(e: KeyInfo, keymap: Readonly<Record<string, PlayerAction>> = DEFAULT_KEYMAP): PlayerAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null
  const action = keymap[e.code]
  if (!action) return null
  const el = e.target instanceof Element ? e.target : null
  // Escape in a popover closes the popover, not fullscreen
  if (el?.closest(OWN_KEYS)) return null
  if (el?.closest(OWN_ARROWS) && e.code.startsWith('Arrow')) return null
  return action
}
