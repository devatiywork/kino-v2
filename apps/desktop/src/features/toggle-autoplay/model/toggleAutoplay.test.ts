import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { toggleAutoplay } = await import('./toggleAutoplay')
const { settingsStore } = await import('../../../entities/settings')
const { DEFAULT_SETTINGS } = await import('../../../shared/ipc/settings')
const { osdStore } = await import('../../../entities/playback/model/osd')
const mock = await tauri

describe('toggleAutoplay (integration)', () => {
  beforeEach(() => {
    mock.reset()
    settingsStore.set(DEFAULT_SETTINGS)
  })

  it('переключатель в плеере меняет ту же настройку, что и экран настроек', async () => {
    mock.respond('settings_update', { ...DEFAULT_SETTINGS, autoplay: false })
    await toggleAutoplay()
    expect(mock.calls()).toEqual([['settings_update', { patch: { autoplay: false } }]])
    expect(settingsStore.get().autoplay).toBe(false)
    expect(osdStore.get().message).toBe('Автовоспроизведение выключено')
  })
})
