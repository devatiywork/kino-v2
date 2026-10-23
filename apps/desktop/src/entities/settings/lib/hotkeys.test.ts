import { describe, expect, it } from 'vitest'
import { DEFAULT_HOTKEYS, keyLabel, keymapOf, rebind, resolveHotkeys } from './hotkeys'

const press = (code: string, mods: { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean } = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
})

describe('горячие клавиши', () => {
  it('по умолчанию — клавиши из ТЗ 3.1, переназначенные поверх них', () => {
    expect(resolveHotkeys({})).toEqual(DEFAULT_HOTKEYS)
    const hotkeys = resolveHotkeys({ togglePause: 'KeyK', unknownAction: 'KeyZ' })
    expect(hotkeys.togglePause).toBe('KeyK')
    expect(hotkeys).not.toHaveProperty('unknownAction')
  })

  it('по коду клавиши находится действие; Escape всегда выходит из полного экрана', () => {
    const keymap = keymapOf(resolveHotkeys({ toggleFullscreen: 'Enter' }))
    expect(keymap.Enter).toBe('toggleFullscreen')
    expect(keymap.KeyF).toBeUndefined()
    expect(keymap.Escape).toBe('exitFullscreen')
  })

  it('свободная клавиша просто назначается, в настройках — только отличия', () => {
    const result = rebind({}, 'togglePause', press('KeyK'))
    expect(result).toEqual({ ok: true, overrides: { togglePause: 'KeyK' }, swapped: null })
  })

  it('занятая клавиша меняется местами с прежней', () => {
    // S — субтитры; пауза забирает S, субтитры получают Пробел
    const result = rebind({}, 'togglePause', press('KeyS'))
    expect(result).toEqual({ ok: true, overrides: { togglePause: 'KeyS', toggleSubtitles: 'Space' }, swapped: 'toggleSubtitles' })
  })

  it('возврат к стандартной клавише убирает её из настроек', () => {
    const result = rebind({ togglePause: 'KeyK' }, 'togglePause', press('Space'))
    expect(result).toEqual({ ok: true, overrides: {}, swapped: null })
  })

  it('Escape, Tab и сочетания с Ctrl / Alt / Win не назначаются', () => {
    expect(rebind({}, 'seekBack', press('Escape'))).toEqual({ ok: false, reason: 'reserved' })
    expect(rebind({}, 'seekBack', press('Tab'))).toEqual({ ok: false, reason: 'reserved' })
    expect(rebind({}, 'seekBack', press('KeyJ', { ctrlKey: true }))).toEqual({ ok: false, reason: 'modifier' })
  })

  it('подписи клавиш', () => {
    expect(keyLabel('Space', 'Пробел')).toBe('Пробел')
    expect(keyLabel('ArrowLeft', 'Пробел')).toBe('←')
    expect(keyLabel('KeyF', 'Пробел')).toBe('F')
    expect(keyLabel('Digit5', 'Пробел')).toBe('5')
    expect(keyLabel('Numpad5', 'Пробел')).toBe('Num 5')
    expect(keyLabel('BracketLeft', 'Пробел')).toBe('[')
    expect(keyLabel('F5', 'Пробел')).toBe('F5')
  })
})
