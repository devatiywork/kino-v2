import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyAccent, applyTheme, resolveTheme } from './theme'

type Listener = () => void

function mockSystemTheme(dark: boolean) {
  const listeners = new Set<Listener>()
  const media = {
    matches: dark,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  }
  vi.stubGlobal('matchMedia', () => media)
  return {
    switchTo(nextDark: boolean) {
      media.matches = nextDark
      for (const listener of listeners) listener()
    },
    listenerCount: () => listeners.size,
  }
}

describe('темы', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-accent')
  })

  it('resolveTheme: явный выбор важнее системы', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('applyTheme ставит data-theme на корень', () => {
    mockSystemTheme(true)
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('«как в системе» следует за Windows и перестаёт после отписки', () => {
    const system = mockSystemTheme(false)
    const stop = applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('light')
    system.switchTo(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    stop()
    expect(system.listenerCount()).toBe(0)
    system.switchTo(false)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('applyAccent ставит акцент из набора на корень', () => {
    applyAccent('teal')
    expect(document.documentElement.dataset.accent).toBe('teal')
    applyAccent('ember')
    expect(document.documentElement.dataset.accent).toBe('ember')
  })
})
