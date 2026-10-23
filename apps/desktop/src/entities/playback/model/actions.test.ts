import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SOPRANOS_TRACKS } from '../../../test/tracks'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('@tauri-apps/api/core', async () => ({ invoke: (await tauri).invoke }))
vi.mock('@tauri-apps/api/event', async () => ({ listen: (await tauri).listen }))

const { changeVolume, seekBy, selectAudio, selectSubtitle, setVolume, togglePause } = await import('./actions')
const { initialPlayback, playbackStore } = await import('./playbackStore')
const { osdStore } = await import('./osd')
const mock = await tauri

describe('player actions → IPC (integration)', () => {
  beforeEach(() => {
    mock.reset()
    playbackStore.set({ ...initialPlayback, idle: false, duration: 3601, tracks: SOPRANOS_TRACKS, audioId: 1 })
  })

  it('пауза и продолжение', () => {
    togglePause()
    expect(mock.calls()).toEqual([['player_set_paused', { paused: true }]])
  })

  it('«играть» в конце файла начинает сначала', () => {
    playbackStore.set({ paused: true, eof: true })
    togglePause()
    expect(mock.calls()).toEqual([
      ['player_seek', { seconds: 0, mode: 'absolute' }],
      ['player_set_paused', { paused: false }],
    ])
  })

  it('перемотка на 10 секунд — относительная', () => {
    seekBy(-10)
    expect(mock.calls()).toEqual([['player_seek', { seconds: -10, mode: 'relative' }]])
  })

  it('громкость ограничена 0–130, округляется и снимает «без звука»', () => {
    playbackStore.set({ muted: true })
    setVolume(140.4)
    expect(mock.calls()).toEqual([
      ['player_set_volume', { volume: 130 }],
      ['player_set_muted', { muted: false }],
    ])
  })

  it('колесо и стрелки показывают громкость поверх видео', () => {
    playbackStore.set({ volume: 80 })
    changeVolume(5)
    expect(mock.calls()).toEqual([['player_set_volume', { volume: 85 }]])
    expect(osdStore.get().message).toBe('Громкость 85')
  })

  it('озвучка меняется по id дорожки этого файла', () => {
    selectAudio(SOPRANOS_TRACKS[3] ?? null)
    expect(mock.calls()).toEqual([['player_set_audio', { id: 4 }]])
    expect(osdStore.get().message).toBe('Озвучка: DD 5.1 @ 640 kbps (English)')
  })

  it('выбор субтитров включает их показ, «выключены» — sid no', () => {
    playbackStore.set({ subtitlesVisible: false })
    selectSubtitle(SOPRANOS_TRACKS[4] ?? null)
    expect(mock.calls()).toEqual([
      ['player_set_subtitle', { id: 1 }],
      ['player_set_subtitles_visible', { visible: true }],
    ])
    mock.reset()
    selectSubtitle(null)
    expect(mock.calls()).toEqual([['player_set_subtitle', { id: null }]])
    expect(osdStore.get().message).toBe('Субтитры: Выключены')
  })
})
