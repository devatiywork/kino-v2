export interface DesktopGuardsOptions {
  /** Оставить F12 и Ctrl+Shift+I — только для отладочной сборки */
  allowDevtools?: boolean
}

const EDITABLE = 'input, textarea, [contenteditable="true"]'

/** Сочетания, которые в WebView2 делают «браузерные» вещи: перезагрузка, печать, поиск, масштаб, новое окно */
const BLOCKED_CTRL_KEYS = new Set(['r', 'p', 'f', 'g', 'u', 's', 'j', 'h', 'd', 'n', 't', 'o', '=', '+', '-', '0'])
const BLOCKED_KEYS = new Set(['F3', 'F5', 'F7', 'BrowserBack', 'BrowserForward', 'BrowserRefresh', 'BrowserSearch'])
const DEVTOOLS_CTRL_SHIFT_KEYS = new Set(['i', 'j', 'c'])
const EDITING_CTRL_KEYS = new Set(['a', 'c', 'v', 'x', 'z', 'y'])

function isEditable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE) !== null
}

export function isBrowserShortcut(event: KeyboardEvent, options: DesktopGuardsOptions = {}): boolean {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (BLOCKED_KEYS.has(key)) return true
  if (key === 'F12') return !options.allowDevtools
  if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) return true
  if (!event.ctrlKey && !event.metaKey) return false
  if (event.shiftKey && DEVTOOLS_CTRL_SHIFT_KEYS.has(key)) return !options.allowDevtools
  // В полях ввода работают обычные сочетания редактирования
  if (EDITING_CTRL_KEYS.has(key)) return false
  return BLOCKED_CTRL_KEYS.has(key)
}

/**
 * Отключает браузерное поведение WebView: перезагрузку, печать, поиск по странице, масштаб,
 * системное контекстное меню, автопрокрутку средней кнопкой, перетаскивание картинок
 * и переход по брошенному в окно файлу. Обработчики приложения продолжают получать события.
 * Возвращает функцию, которая снимает все ограничения.
 */
export function installDesktopGuards(options: DesktopGuardsOptions = {}): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (isBrowserShortcut(event, options)) event.preventDefault()
  }
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey) event.preventDefault()
  }
  const onContextMenu = (event: MouseEvent) => {
    if (!isEditable(event.target)) event.preventDefault()
  }
  const onMouseDown = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault()
  }
  const onDragStart = (event: DragEvent) => {
    if (event.target instanceof Element && event.target.closest('img, a, svg')) event.preventDefault()
  }
  const onDropDefault = (event: DragEvent) => {
    event.preventDefault()
  }

  const listeners: Array<[string, EventListener, AddEventListenerOptions]> = [
    ['keydown', onKeyDown as EventListener, { capture: true }],
    ['wheel', onWheel as EventListener, { capture: true, passive: false }],
    ['contextmenu', onContextMenu as EventListener, { capture: true }],
    ['mousedown', onMouseDown as EventListener, { capture: true }],
    ['dragstart', onDragStart as EventListener, { capture: true }],
    ['dragover', onDropDefault as EventListener, {}],
    ['drop', onDropDefault as EventListener, {}],
  ]
  for (const [type, listener, opts] of listeners) window.addEventListener(type, listener, opts)
  return () => {
    for (const [type, listener, opts] of listeners) window.removeEventListener(type, listener, opts)
  }
}
