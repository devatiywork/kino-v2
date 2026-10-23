import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { onAutoplayed, openNeighborEpisode, toggleAutoplay } = await import('./episodes')
const { initialPlayback, playbackStore } = await import('./playbackStore')
const { osdStore } = await import('./osd')
const { resumeStore } = await import('./resume')
const mock = await tauri

describe('episodes (integration)', () => {
  beforeEach(() => {
    mock.reset()
    playbackStore.set({ ...initialPlayback, idle: false, seriesKey: 'show:x', autoplay: true })
  })

  it('N / P открывают соседнюю серию и показывают, откуда она продолжена', async () => {
    mock.respond('player_open_neighbor', { resumedFrom: 95 })
    await openNeighborEpisode(1)
    expect(mock.calls()).toEqual([['player_open_neighbor', { step: 1 }]])
    expect(resumeStore.get().from).toBe(95)
  })

  it('соседней нет — сообщение поверх видео', async () => {
    mock.respond('player_open_neighbor', null)
    await openNeighborEpisode(-1)
    expect(osdStore.get().message).toBe('Это первая серия')
  })

  it('автовоспроизведение: какая серия началась и откуда', () => {
    onAutoplayed({ resumedFrom: null, season: 1, episode: 3 })
    expect(osdStore.get().message).toBe('Сезон 1 · Серия 3')
    expect(resumeStore.get().from).toBeNull()
  })

  it('переключатель автовоспроизведения запоминается в ядре', () => {
    toggleAutoplay()
    expect(mock.calls()).toEqual([['player_set_autoplay', { enabled: false }]])
    expect(osdStore.get().message).toBe('Автовоспроизведение выключено')
  })
})
