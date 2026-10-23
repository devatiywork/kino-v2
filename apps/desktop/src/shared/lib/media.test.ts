import { describe, expect, it } from 'vitest'
import { baseName, extensionOf, fileName, isVideoPath } from './media'

describe('media paths', () => {
  const path = 'E:\\Сериалы\\Soprano\\1  Сезон\\The.Sopranos.S01E01.720p.BluRay.mkv'

  it('имя файла и расширение для путей Windows и с прямыми слешами', () => {
    expect(fileName(path)).toBe('The.Sopranos.S01E01.720p.BluRay.mkv')
    expect(fileName('D:/video/a.MP4')).toBe('a.MP4')
    expect(extensionOf('D:/video/a.MP4')).toBe('mp4')
    expect(baseName(path)).toBe('The.Sopranos.S01E01.720p.BluRay')
  })

  it('видео узнаётся по расширению, регистр не важен', () => {
    expect(isVideoPath(path)).toBe(true)
    expect(isVideoPath('C:\\x\\film.M2TS')).toBe(true)
    expect(isVideoPath('C:\\x\\subs.srt')).toBe(false)
    expect(isVideoPath('C:\\x\\game.torrent')).toBe(false)
    expect(isVideoPath('C:\\x\\.mkv')).toBe(false)
  })
})
