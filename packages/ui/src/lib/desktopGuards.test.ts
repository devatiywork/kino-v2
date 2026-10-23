import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installDesktopGuards } from './desktopGuards'

function key(init: KeyboardEventInit, target: EventTarget = document.body): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe('installDesktopGuards', () => {
  let uninstall: () => void = () => undefined

  beforeEach(() => {
    uninstall = installDesktopGuards()
  })
  afterEach(() => {
    uninstall()
    document.body.innerHTML = ''
  })

  it('блокирует перезагрузку, печать, поиск и масштаб браузера', () => {
    expect(key({ key: 'F5' })).toBe(true)
    expect(key({ key: 'r', ctrlKey: true })).toBe(true)
    expect(key({ key: 'p', ctrlKey: true })).toBe(true)
    expect(key({ key: 'f', ctrlKey: true })).toBe(true)
    expect(key({ key: '=', ctrlKey: true })).toBe(true)
    expect(key({ key: 'ArrowLeft', altKey: true })).toBe(true)
  })

  it('не трогает обычные клавиши плеера', () => {
    expect(key({ key: ' ' })).toBe(false)
    expect(key({ key: 'ArrowRight' })).toBe(false)
    expect(key({ key: 'f' })).toBe(false)
  })

  it('оставляет сочетания редактирования в полях ввода', () => {
    const input = document.createElement('input')
    document.body.append(input)
    expect(key({ key: 'c', ctrlKey: true }, input)).toBe(false)
    expect(key({ key: 'v', ctrlKey: true }, input)).toBe(false)
    expect(key({ key: 'a', ctrlKey: true }, input)).toBe(false)
  })

  it('закрывает инструменты разработчика, если они не разрешены', () => {
    expect(key({ key: 'F12' })).toBe(true)
    expect(key({ key: 'I', ctrlKey: true, shiftKey: true })).toBe(true)
    uninstall()
    uninstall = installDesktopGuards({ allowDevtools: true })
    expect(key({ key: 'F12' })).toBe(false)
  })

  it('масштаб колесом с Ctrl отключён', () => {
    const event = new WheelEvent('wheel', { ctrlKey: true, cancelable: true, bubbles: true })
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('системное контекстное меню есть только в полях ввода', () => {
    const outside = new MouseEvent('contextmenu', { cancelable: true, bubbles: true })
    document.body.dispatchEvent(outside)
    expect(outside.defaultPrevented).toBe(true)

    const input = document.createElement('input')
    document.body.append(input)
    const inside = new MouseEvent('contextmenu', { cancelable: true, bubbles: true })
    input.dispatchEvent(inside)
    expect(inside.defaultPrevented).toBe(false)
  })

  it('средняя кнопка не включает автопрокрутку', () => {
    const event = new MouseEvent('mousedown', { button: 1, cancelable: true, bubbles: true })
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('после снятия ограничений браузер снова получает события', () => {
    uninstall()
    expect(key({ key: 'F5' })).toBe(false)
    uninstall = () => undefined
  })
})
