import type { SeriesDetail, SeriesSummary } from '../shared/ipc/library'
import { libraryFile } from './library'

/** «Kino Test»: season 1 of three episodes, the first watched, the second stopped at 1:42 */
export function seriesDetail(patch: Partial<SeriesDetail> = {}): SeriesDetail {
  return {
    key: 'show:kino test',
    title: 'Kino Test',
    dir: 'D:\\Сериалы\\Kino Test',
    seasons: [
      {
        season: 1,
        episodes: [
          libraryFile({ id: 1, seriesTitle: 'Kino Test', watched: true, position: 3600 }),
          libraryFile({ id: 2, seriesTitle: 'Kino Test', position: 102 }),
          libraryFile({ id: 3, seriesTitle: 'Kino Test', position: 0, lastPlayedAt: null }),
        ],
      },
    ],
    nextUp: 2,
    audio: { kind: 'track', label: 'English.mka' },
    subtitles: { kind: 'off' },
    ...patch,
  }
}

export function seriesSummary(patch: Partial<SeriesSummary> = {}): SeriesSummary {
  return {
    key: 'show:kino test',
    title: 'Kino Test',
    dir: 'D:\\Сериалы\\Kino Test',
    seasons: 1,
    episodes: 3,
    watched: 1,
    nextUp: libraryFile({ id: 2, seriesTitle: 'Kino Test', position: 102 }),
    seasonProgress: [1, 0.03, 0],
    seasonWatched: 1,
    lastPlayedAt: 1_792_800_000_000,
    thumb: null,
    ...patch,
  }
}
