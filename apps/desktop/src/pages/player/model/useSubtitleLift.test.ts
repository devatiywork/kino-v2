import { describe, expect, it } from 'vitest'
import { subtitleMargin } from './useSubtitleLift'

describe('subtitleMargin', () => {
  it('панель скрыта — обычный отступ mpv', () => {
    expect(subtitleMargin(false, 800)).toBe(22)
  })

  it('панель видна — субтитры поднимаются на её высоту в масштабе 720p', () => {
    expect(subtitleMargin(true, 720)).toBe(22 + 120)
    expect(subtitleMargin(true, 800)).toBe(22 + 108)
    // во весь экран панель занимает меньшую долю высоты
    expect(subtitleMargin(true, 1152)).toBe(22 + 75)
  })
})
