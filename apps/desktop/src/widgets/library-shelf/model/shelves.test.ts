import { describe, expect, it } from 'vitest'
import { libraryFile } from '../../../test/library'
import { seriesSummary } from '../../../test/series'
import { archiveEntry, categories } from '../../../test/torrents'
import { buildShelves, shelfSize } from './shelves'

const titles = { series: 'Сериалы', films: 'Фильмы', noCategory: 'Без категории' }
const film = libraryFile({ id: 5, title: 'Heat 1995', seriesTitle: null, season: null, episode: null })
const game = archiveEntry({ id: 21, name: 'Hollow Knight', categoryId: 2, status: 'onDisk' })
const tool = archiveEntry({ id: 22, name: 'Krita 5.2', categoryId: 3, status: 'onDisk' })
const loose = archiveEntry({ id: 23, name: 'Fonts', categoryId: null, status: 'onDisk' })

describe('полки библиотеки', () => {
  it('сериалы и фильмы всегда; категории — в своём порядке, «Без категории» последней', () => {
    const shelves = buildShelves({ series: [seriesSummary()], films: [film], torrents: [loose, tool, game], categories, titles })
    expect(shelves.map((s) => [s.id, s.title, shelfSize(s)])).toEqual([
      ['series', 'Сериалы', 1],
      ['films', 'Фильмы', 1],
      ['category:2', 'Игры', 1],
      ['category:3', 'Программы', 1],
      ['category:none', 'Без категории', 1],
    ])
  })

  it('пустая категория не показывается, пустые сериалы и фильмы — да', () => {
    const shelves = buildShelves({ series: [], films: [], torrents: [game], categories, titles })
    expect(shelves.map((s) => s.id)).toEqual(['series', 'films', 'category:2'])
  })

  it('категория «Сериалы» торрентов — не второй чип, а часть полки сериалов', () => {
    const notVideo = archiveEntry({ id: 24, name: 'Severance.S02.Extras', categoryId: 1, status: 'onDisk' })
    const shelves = buildShelves({ series: [seriesSummary()], films: [], torrents: [notVideo], categories, titles })
    expect(shelves.map((s) => s.id)).toEqual(['series', 'films'])
    expect(shelves[0]?.torrents.map((e) => e.name)).toEqual(['Severance.S02.Extras'])
  })

  it('торрент удалённой категории — в «Без категории»', () => {
    const orphan = archiveEntry({ id: 25, name: 'Old', categoryId: 99, status: 'onDisk' })
    const shelves = buildShelves({ series: [], films: [], torrents: [orphan], categories, titles })
    expect(shelves.at(-1)?.id).toBe('category:none')
  })
})
