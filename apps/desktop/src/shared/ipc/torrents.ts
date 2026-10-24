import { invoke, listen, type UnlistenFn } from './bridge'

/** Mirrors src-tauri/src/torrent/mod.rs */
/** `queued` — waits on pause for its place in «Очередь» (the settings' limit of downloads at once) */
export type TorrentState = 'checking' | 'downloading' | 'seeding' | 'paused' | 'queued' | 'error'

export interface ActiveTorrent {
  id: number
  infoHash: string
  name: string
  categoryId: number | null
  state: TorrentState
  error: string | null
  /** 0…1 of the chosen files */
  progress: number
  /** Bytes of the chosen files and how many are here */
  size: number
  done: number
  totalSize: number
  fileCount: number
  /** Bytes per second */
  downloadSpeed: number
  uploadSpeed: number
  /** Seconds left at the current speed */
  eta: number | null
  uploaded: number
  ratio: number
  peers: number
  peersSeen: number
  saveDir: string
  contentPath: string
  sourceUrl: string | null
  addedAt: number
  completedAt: number | null
  /** A fully downloaded video file: «Смотреть» */
  video: string | null
}

export interface TorrentsUpdate {
  torrents: ActiveTorrent[]
  downloadSpeed: number
  uploadSpeed: number
}

export type ArchiveStatus = 'inDownloads' | 'onDisk' | 'filesDeleted'

/** What restoring a backup did (src-tauri/src/torrent/backup.rs) */
export interface RestoreReport {
  added: number
  /** Already in the archive */
  skipped: number
  /** Records without a readable .torrent */
  broken: number
}

export interface ArchiveEntry {
  id: number
  infoHash: string
  name: string
  totalSize: number
  fileCount: number
  categoryId: number | null
  saveDir: string
  contentPath: string
  sourceUrl: string | null
  addedAt: number
  completedAt: number | null
  status: ArchiveStatus
  uploaded: number
}

export interface Category {
  id: number
  name: string
  /** Where its downloads go */
  folder: string
  /** Chosen by the user; otherwise «<downloads folder>\<name>» */
  customFolder: boolean
}

export interface TorrentFile {
  index: number
  path: string
  size: number
}

export interface Preview {
  infoHash: string
  name: string
  totalSize: number
  files: TorrentFile[]
  /** «Уже в архиве» */
  duplicate: ArchiveEntry | null
  /** Trackers this .torrent or magnet link brought to the archive's record («объединить трекеры») */
  mergedTrackers: number
}

export type PreviewSource = { kind: 'file'; path: string } | { kind: 'magnet'; uri: string }

export interface AddRequest {
  infoHash: string
  categoryId: number | null
  saveDir: string
  /** null — every file */
  onlyFiles: number[] | null
  sourceUrl: string | null
  start: boolean
}

export interface FileProgress extends TorrentFile {
  done: number
  selected: boolean
}

export interface PeerView {
  address: string
  connection: string
  client: string | null
  downloaded: number
  uploaded: number
  /** Bytes per second */
  downloadSpeed: number
  uploadSpeed: number
}

/** SPEC 4.3: how long a torrent seeds after it is downloaded */
export type Seeding = { mode: 'default' } | { mode: 'ratio'; ratio: number } | { mode: 'never' }

export interface TorrentDetails {
  files: FileProgress[]
  peers: PeerView[]
  trackers: string[]
  comment: string | null
  createdBy: string | null
  createdAt: number | null
  private: boolean
  pieceSize: number
  pieces: number
  magnet: string
  /** «Скачано»: up to 300 parts, 0…255 each; empty — not checked yet */
  pieceMap: number[]
  peersLive: number
  peersSeen: number
  /** Fetched and thrown away */
  lost: number
  /** Where else peers come from; a private torrent asks its trackers only */
  discovery: { dht: boolean; pex: boolean; lsd: boolean }
  seeding: Seeding
}

export type TorrentNotice =
  | { type: 'finished'; name: string; archived: boolean }
  /** Its own ratio is reached: to the archive */
  | { type: 'seeded'; name: string; ratio: number }

/** Typed wrappers over the torrent commands (src-tauri/src/torrent/commands.rs) */
export const torrentsIpc = {
  list: () => invoke<TorrentsUpdate>('torrent_list'),
  categories: () => invoke<Category[]>('torrent_categories'),
  createCategory: (name: string, folder: string | null) => invoke<Category>('torrent_category_create', { name, folder }),
  updateCategory: (id: number, name: string, folder: string | null) => invoke<void>('torrent_category_update', { id, name, folder }),
  /** Its torrents go to «Без категории» */
  deleteCategory: (id: number) => invoke<void>('torrent_category_delete', { id }),
  /** A .torrent or a magnet link; a magnet waits for the peers (up to 90 s) */
  preview: (source: PreviewSource) => invoke<Preview>('torrent_preview', { source }),
  add: (request: AddRequest) => invoke<number>('torrent_add', { request }),
  pause: (id: number) => invoke<void>('torrent_pause', { id }),
  resume: (id: number) => invoke<void>('torrent_resume', { id }),
  pauseAll: (paused: boolean) => invoke<void>('torrent_pause_all', { paused }),
  /** «Убрать из загрузок» (false) / «Удалить с файлами» (true); the archive keeps the record */
  remove: (id: number, deleteFiles: boolean) => invoke<void>('torrent_remove', { id, deleteFiles }),
  /** What seeds now goes to the archive (when «Не раздавать после загрузки» is turned on) */
  archiveSeeding: () => invoke<number>('torrent_archive_seeding'),
  setCategory: (id: number, categoryId: number | null) => invoke<void>('torrent_set_category', { id, categoryId }),
  setSource: (id: number, url: string | null) => invoke<void>('torrent_set_source', { id, url }),
  setFiles: (id: number, files: number[]) => invoke<void>('torrent_set_files', { id, files }),
  details: (id: number) => invoke<TorrentDetails>('torrent_details', { id }),
  archive: (query = '') => invoke<ArchiveEntry[]>('torrent_archive', { query }),
  downloadAgain: (id: number, saveDir: string | null, start: boolean) => invoke<void>('torrent_download_again', { id, saveDir, start }),
  /** SPEC 4.4 «Резервная копия»: the whole archive into a file; the number of records */
  exportArchive: (path: string) => invoke<number>('torrent_export_archive', { path }),
  /** What the archive lacks comes back from a backup */
  restoreArchive: (path: string) => invoke<RestoreReport>('torrent_restore_archive', { path }),
  /** SPEC 4.3 «Параметры торрента» */
  setSeeding: (id: number, seeding: Seeding) => invoke<void>('torrent_set_seeding', { id, seeding }),
  /** Every piece on disk is checked again */
  recheck: (id: number) => invoke<void>('torrent_recheck', { id }),
  /** Trackers, DHT and LSD are asked for peers now */
  reannounce: (id: number) => invoke<void>('torrent_reannounce', { id }),
  /** The archive's .torrent into a chosen file */
  saveFile: (id: number, path: string) => invoke<void>('torrent_save_file', { id, path }),
  /** A sample a second for the last 30 minutes: [download, upload] */
  speedHistory: (id: number) => invoke<[number, number][]>('torrent_speed_history', { id }),
  seedAgain: (id: number) => invoke<void>('torrent_seed_again', { id }),
  /** «Удалить из архива»: the record and its .torrent; files on disk stay */
  deleteRecord: (id: number) => invoke<void>('torrent_delete_record', { id }),
  magnet: (id: number) => invoke<string>('torrent_magnet', { id }),
  downloadsFolder: () => invoke<string>('torrent_downloads_folder'),
  onUpdate: (handler: (update: TorrentsUpdate) => void): Promise<UnlistenFn> =>
    listen<TorrentsUpdate>('torrents://update', (e) => handler(e.payload)),
  onChanged: (handler: () => void): Promise<UnlistenFn> => listen('torrents://changed', () => handler()),
  onNotice: (handler: (notice: TorrentNotice) => void): Promise<UnlistenFn> =>
    listen<TorrentNotice>('torrents://notice', (e) => handler(e.payload)),
}

/** A magnet link in a text: what the clipboard or a paste holds */
export function findMagnet(text: string): string | null {
  const match = /magnet:\?[^\s"'<>]+/i.exec(text)
  return match ? match[0] : null
}

export const isTorrentPath = (path: string): boolean => path.toLowerCase().endsWith('.torrent')
