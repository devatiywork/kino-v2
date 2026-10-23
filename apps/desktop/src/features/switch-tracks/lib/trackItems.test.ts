import { describe, expect, it } from 'vitest'
import { SOPRANOS_TRACKS } from '../../../test/tracks'
import { OFF_KEY, trackByKey, trackItems, trackKey } from './trackItems'

const LABELS = { off: 'Выключены', external: 'внешние', unknown: (id: number) => `Дорожка ${id}` }

describe('trackItems', () => {
  it('только дорожки своего типа, «выключено» первым', () => {
    const subs = trackItems(SOPRANOS_TRACKS, 'sub', 'ru', LABELS)
    expect(subs.map((i) => i.id)).toEqual([OFF_KEY, '1', '2'])
    expect(subs[0]?.label).toBe('Выключены')
  })

  it('подпись, подробности и пометка внешних', () => {
    const subs = trackItems(SOPRANOS_TRACKS, 'sub', 'ru', LABELS)
    expect(subs[1]).toMatchObject({ label: 'SRT (Novamedia)', description: 'RU · SRT' })
    expect(subs[2]).toMatchObject({ label: 'Английский', description: 'EN · ASS', badge: 'внешние' })
  })

  it('ключ и обратно — по типу и id, id повторяются между типами', () => {
    expect(trackKey(null)).toBe(OFF_KEY)
    expect(trackKey(4)).toBe('4')
    expect(trackByKey(SOPRANOS_TRACKS, 'audio', '4')?.title).toBe('DD 5.1 @ 640 kbps (English)')
    expect(trackByKey(SOPRANOS_TRACKS, 'sub', '1')?.kind).toBe('sub')
    expect(trackByKey(SOPRANOS_TRACKS, 'audio', OFF_KEY)).toBeNull()
    expect(trackByKey(SOPRANOS_TRACKS, 'audio', '9')).toBeNull()
  })
})
