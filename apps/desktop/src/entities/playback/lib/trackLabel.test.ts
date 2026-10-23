import { describe, expect, it } from 'vitest'
import { track } from '../../../test/tracks'
import { languageName, trackDetails, trackTitle } from './trackLabel'

describe('trackLabel', () => {
  it('язык по коду ISO 639-2 из контейнера — на языке интерфейса', () => {
    expect(languageName('rus', 'ru')).toBe('Русский')
    expect(languageName('eng', 'ru')).toBe('Английский')
    expect(languageName('eng', 'en')).toBe('English')
    expect(languageName('jpn', 'ru')).toBe('Японский')
  })

  it('неизвестный или пустой язык', () => {
    expect(languageName(null, 'ru')).toBeNull()
    expect(languageName('und', 'ru')).toBeNull()
    expect(languageName('xyz', 'ru')).toBe('XYZ')
  })

  it('название дорожки из файла важнее языка', () => {
    expect(trackTitle(track({ id: 1, kind: 'audio', title: 'AVO Goblin', lang: 'rus' }), 'ru', '?')).toBe('AVO Goblin')
    expect(trackTitle(track({ id: 2, kind: 'audio', lang: 'eng' }), 'ru', '?')).toBe('Английский')
    expect(trackTitle(track({ id: 3, kind: 'audio' }), 'ru', 'Дорожка 3')).toBe('Дорожка 3')
  })

  it('подробности: язык, кодек и каналы', () => {
    expect(trackDetails(track({ id: 1, kind: 'audio', lang: 'rus', codec: 'ac3', channels: 6 }))).toBe('RU · AC3 5.1')
    expect(trackDetails(track({ id: 1, kind: 'audio', lang: 'eng', codec: 'eac3', channels: 2 }))).toBe('EN · E-AC3 2.0')
    expect(trackDetails(track({ id: 1, kind: 'sub', codec: 'hdmv_pgs_subtitle' }))).toBe('PGS')
    expect(trackDetails(track({ id: 1, kind: 'sub', lang: 'und' }))).toBe('')
  })
})
