import { describe, expect, it, vi } from 'vitest'
import { siteKey } from './trackers'

describe('siteKey', () => {
  it('поддомены и www — тот же сайт', () => {
    expect(siteKey('https://rutracker.org/forum/index.php')).toBe('rutracker.org')
    expect(siteKey('https://bt.rutracker.org/dl.php?t=1')).toBe('rutracker.org')
    expect(siteKey('http://WWW.Rutor.Info/torrent/1')).toBe('rutor.info')
  })

  it('короткие зоны вроде co.uk — три метки', () => {
    expect(siteKey('https://tracker.example.co.uk/')).toBe('example.co.uk')
    expect(siteKey('https://example.co.uk/')).toBe('example.co.uk')
  })

  it('адрес и имя без точки — как есть, порт не важен', () => {
    expect(siteKey('http://127.0.0.1:50299/topic/1')).toBe('127.0.0.1')
    expect(siteKey('http://localhost:5181/')).toBe('localhost')
    expect(siteKey('http://[::1]:8080/')).toBe('[::1]')
  })

  it('не ссылка — null', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(siteKey('rutracker')).toBeNull()
    warn.mockRestore()
  })
})
