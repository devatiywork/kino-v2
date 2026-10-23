import { describe, expect, it } from 'vitest'
import { pointerTime } from './pointerTime'

describe('pointerTime', () => {
  const rect = { left: 100, width: 400 }

  it('доля ширины полосы — доля длительности', () => {
    expect(pointerTime(300, rect, 3600)).toBe(1800)
    expect(pointerTime(100, rect, 3600)).toBe(0)
  })

  it('за краями — начало и конец', () => {
    expect(pointerTime(50, rect, 3600)).toBe(0)
    expect(pointerTime(900, rect, 3600)).toBe(3600)
  })

  it('без длительности или ширины — 0', () => {
    expect(pointerTime(300, rect, 0)).toBe(0)
    expect(pointerTime(300, { left: 0, width: 0 }, 3600)).toBe(0)
  })
})
