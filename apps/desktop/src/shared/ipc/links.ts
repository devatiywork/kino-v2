import { invoke } from './bridge'
import type { ArchiveEntry } from './torrents'

/** Mirrors src-tauri/src/links.rs: where the player's library and the torrents meet (SPEC 5) */

/** A torrent some episodes of a series came from */
export interface SeriesSource {
  torrent: ArchiveEntry
  episodes: number
  /** Gone from the disk: «Скачать снова» brings them back */
  missing: number
}

/** What «Освободить место» deletes (or deleted) */
export interface SeasonSpace {
  files: number
  bytes: number
  /** Torrents that stop seeding: their files are among these */
  seeding: string[]
  /** Could not be deleted (open in another program) */
  failed: number
}

export const linksIpc = {
  seriesSources: (key: string) => invoke<SeriesSource[]>('app_series_sources', { key }),
  /** `season` null — episodes without a season number */
  seasonSpace: (key: string, season: number | null) => invoke<SeasonSpace>('app_season_space', { key, season }),
  freeSeason: (key: string, season: number | null) => invoke<SeasonSpace>('app_free_season', { key, season }),
}
