import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { loadSettings, settingsStore, startSettingsSync, updateSettings } = await import('./settingsStore')
const { DEFAULT_SETTINGS } = await import('../../../shared/ipc/settings')
const mock = await tauri

describe('settingsStore (integration)', () => {
  beforeEach(() => {
    mock.reset()
    settingsStore.set(DEFAULT_SETTINGS)
  })

  it('до первого кадра забирает настройки из ядра', async () => {
    mock.respond('settings_get', { ...DEFAULT_SETTINGS, theme: 'light', language: 'en' })
    const settings = await loadSettings()
    expect(settings.theme).toBe('light')
    expect(settingsStore.get().language).toBe('en')
  })

  it('изменение видно сразу и уходит в ядро только изменённым ключом', async () => {
    let resolve: (value: unknown) => void = () => {}
    mock.invoke.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    const pending = updateSettings({ resume: false })
    expect(settingsStore.get().resume).toBe(false)
    expect(mock.calls()).toEqual([['settings_update', { patch: { resume: false } }]])
    resolve({ ...DEFAULT_SETTINGS, resume: false })
    await pending
    expect(settingsStore.get().resume).toBe(false)
  })

  it('ядро отказало — возвращаются его значения', async () => {
    mock.invoke.mockImplementationOnce(async () => {
      throw new Error('settings: invalid value of theme')
    })
    mock.respond('settings_get', DEFAULT_SETTINGS)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await updateSettings({ resume: false })
    expect(settingsStore.get().resume).toBe(true)
  })

  it('изменения из ядра (например, из плеера) попадают в хранилище', async () => {
    const stop = startSettingsSync()
    await Promise.resolve()
    mock.fire('settings://changed', { ...DEFAULT_SETTINGS, autoplay: false })
    expect(settingsStore.get().autoplay).toBe(false)
    stop()
  })
})
