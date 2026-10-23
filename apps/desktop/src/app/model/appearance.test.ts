import { afterEach, describe, expect, it } from 'vitest'
import { settingsStore } from '../../entities/settings'
import { i18n } from '../../shared/i18n'
import { DEFAULT_SETTINGS } from '../../shared/ipc/settings'
import { startAppearance } from './appearance'

describe('оформление из настроек', () => {
  afterEach(async () => {
    settingsStore.set(DEFAULT_SETTINGS)
    await i18n.changeLanguage('ru')
  })

  it('тема, акцент и язык применяются сразу и следуют за изменениями', async () => {
    settingsStore.set({ ...DEFAULT_SETTINGS, theme: 'light', accent: 'teal' })
    const stop = startAppearance()
    const root = document.documentElement
    expect(root.dataset.theme).toBe('light')
    expect(root.dataset.accent).toBe('teal')
    expect(root.lang).toBe('ru')

    settingsStore.set({ theme: 'dark', accent: 'violet', language: 'en' })
    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.accent).toBe('violet')
    expect(root.lang).toBe('en')
    await expect.poll(() => i18n.language).toBe('en')
    expect(i18n.t('title', { ns: 'settings' })).toBe('Settings')
    stop()
  })
})
