import { describe, expect, it } from 'vitest'
import { resolvePlayerKey, type KeyInfo } from './playerKeymap'

const key = (code: string, patch: Partial<KeyInfo> = {}): KeyInfo => ({
  code,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  target: document.body,
  ...patch,
})

function inside(html: string, selector: string): Element {
  document.body.innerHTML = html
  const el = document.querySelector(selector)
  if (!el) throw new Error(selector)
  return el
}

describe('resolvePlayerKey', () => {
  it('клавиши из ТЗ 3.1 — по физической клавише, и в русской раскладке', () => {
    expect(resolvePlayerKey(key('Space'))).toBe('togglePause')
    expect(resolvePlayerKey(key('ArrowLeft'))).toBe('seekBack')
    expect(resolvePlayerKey(key('ArrowUp'))).toBe('volumeUp')
    expect(resolvePlayerKey(key('KeyF'))).toBe('toggleFullscreen')
    expect(resolvePlayerKey(key('KeyS'))).toBe('toggleSubtitles')
    expect(resolvePlayerKey(key('KeyM'))).toBe('toggleMute')
    expect(resolvePlayerKey(key('Escape'))).toBe('exitFullscreen')
  })

  it('с модификаторами и чужие клавиши — не плеера', () => {
    expect(resolvePlayerKey(key('KeyF', { ctrlKey: true }))).toBeNull()
    expect(resolvePlayerKey(key('KeyQ'))).toBeNull()
  })

  it('Пробел на кнопке после клика — всё равно пауза', () => {
    expect(resolvePlayerKey(key('Space', { target: inside('<button id="b">Вперёд</button>', '#b') }))).toBe('togglePause')
  })

  it('в списках, меню и полях клавиши принадлежат им, Escape закрывает окно', () => {
    const option = inside('<div role="dialog"><ul role="listbox"><li id="o">AVO Goblin</li></ul></div>', '#o')
    expect(resolvePlayerKey(key('ArrowDown', { target: option }))).toBeNull()
    expect(resolvePlayerKey(key('Space', { target: option }))).toBeNull()
    expect(resolvePlayerKey(key('Escape', { target: option }))).toBeNull()
    expect(resolvePlayerKey(key('KeyF', { target: inside('<input id="i">', '#i') }))).toBeNull()
  })

  it('стрелки на ползунке двигают ползунок, остальные клавиши работают', () => {
    const slider = inside('<div role="slider" id="s" tabindex="0"></div>', '#s')
    expect(resolvePlayerKey(key('ArrowRight', { target: slider }))).toBeNull()
    expect(resolvePlayerKey(key('Space', { target: slider }))).toBe('togglePause')
  })
})
