import { describe, expect, it } from 'vitest'
import { badTrackerLines, isProxy, isTime } from './checks'

describe('проверки полей «Загрузок»', () => {
  it('время — часы:минуты', () => {
    expect(['08:00', '8:30', '23:59', '00:00'].every(isTime)).toBe(true)
    expect(['24:00', '12:60', '8', '08-00', ''].some(isTime)).toBe(false)
  })

  it('прокси — только socks5://адрес:порт, можно с логином; пусто — без прокси', () => {
    expect(['', 'socks5://127.0.0.1:1080', 'socks5://user:pw@proxy.local:9050', 'socks5://[::1]:1080'].every(isProxy)).toBe(true)
    expect(['http://127.0.0.1:8080', 'socks5://127.0.0.1', 'socks5://:1080', 'socks5://host:0', 'socks5://host:70000'].some(isProxy)).toBe(false)
  })

  it('трекеры: по адресу в строке, пустые строки и заметки с # — можно', () => {
    expect(badTrackerLines('udp://t.example:6969/announce\n\n# мои\nhttps://t2.example/announce')).toEqual([])
    expect(badTrackerLines('udp://ok/announce\nt.example/announce\nmagnet:?xt=1')).toEqual(['t.example/announce', 'magnet:?xt=1'])
  })
})
