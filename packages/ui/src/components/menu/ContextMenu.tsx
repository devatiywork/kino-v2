import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { Key } from 'react-aria'
import { useOverlayTriggerState } from 'react-stately'
import { usePresence } from '../../lib/usePresence'
import { Popover } from '../popover/Popover'
import { MenuList, type MenuItemData } from './MenuList'

export interface ContextMenuProps<T extends MenuItemData> {
  /** Подпись меню для скринридера */
  label: string
  items: ReadonlyArray<T>
  onAction?: (key: Key) => void
  /** Область, по которой открывается меню */
  children: ReactNode
  isDisabled?: boolean
  className?: string
}

/**
 * Своё контекстное меню вместо системного: открывается правой кнопкой там, где стоит указатель,
 * и с клавиатуры — клавишей «Меню» или Shift+F10.
 */
export function ContextMenu<T extends MenuItemData>({ label, items, onAction, children, isDisabled, className }: ContextMenuProps<T>) {
  const state = useOverlayTriggerState({})
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [point, setPoint] = useState({ x: 0, y: 0 })
  const presence = usePresence(state.isOpen, 150)

  const openAt = (x: number, y: number) => {
    setPoint({ x, y })
    state.open()
  }

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (isDisabled) return
    event.preventDefault()
    openAt(event.clientX, event.clientY)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled) return
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      const rect = (event.target as HTMLElement).getBoundingClientRect()
      openAt(rect.left + 16, rect.top + rect.height / 2)
    }
  }

  return (
    <div className={className} onContextMenu={onContextMenu} onKeyDown={onKeyDown}>
      {children}
      <span ref={anchorRef} aria-hidden="true" className="pointer-events-none fixed size-0" style={{ left: point.x, top: point.y }} />
      {presence.isMounted ? (
        <Popover state={state} triggerRef={anchorRef} placement="bottom start" offset={2} isExiting={presence.isExiting}>
          <MenuList aria-label={label} items={items} onAction={onAction} onClose={state.close} autoFocus="first" />
        </Popover>
      ) : null}
    </div>
  )
}
