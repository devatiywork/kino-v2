import { IconArchive, IconEpisodes, IconPlay, SearchCombo, type SearchComboSection } from '@kino/ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { episodeLine, headline } from '../../../entities/library'
import { categoryName, downloadsView, searchArchive, useTorrents } from '../../../entities/torrent'
import { useOpenVideo } from '../../../features/open-video'
import { seriesThumbSrc, thumbSrc } from '../../../shared/ipc/library'
import { formatSize } from '../../../shared/lib/formatBytes'
import { formatTime } from '../../../shared/lib/formatTime'
import { navigate, openSeries } from '../../../shared/lib/router'
import { useSearchResults, type SearchResults } from '../model/useSearchResults'

/** A frame when there is one, the kind's icon otherwise */
function Frame({ src, fallback }: { src: string | null; fallback: ReactNode }) {
  return src ? <img src={src} alt="" className="size-full object-cover" draggable={false} /> : fallback
}

/**
 * SPEC 2: the search of the title bar. Ctrl K from anywhere; series, played films and episodes,
 * torrents of the archive — a choice opens the series, plays the file or shows the record
 */
export function GlobalSearch() {
  const { t, i18n } = useTranslation()
  const { t: tl } = useTranslation('library')
  const { t: tt } = useTranslation('torrents')
  const categories = useTorrents((s) => s.categories)
  const { openFile } = useOpenVideo()
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const results = useSearchResults(query)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sections = (found: SearchResults): SearchComboSection[] =>
    [
      {
        id: 'series',
        title: t('search.series'),
        items: found.library.series.map((s) => ({
          id: `series:${s.key}`,
          label: s.title,
          description: t('search.seriesInfo', { watched: s.watched, episodes: s.episodes }),
          icon: <Frame src={seriesThumbSrc(s)} fallback={<IconEpisodes size={18} />} />,
        })),
      },
      {
        id: 'history',
        title: t('search.history'),
        items: found.library.files.map((f) => ({
          id: `file:${f.id}`,
          label: headline(f),
          description: [episodeLine(f, tl), f.watched ? tl('watched') : tl('stoppedAt', { time: formatTime(f.position) })].filter(Boolean).join(' · '),
          icon: <Frame src={thumbSrc(f)} fallback={<IconPlay size={16} />} />,
          meta: f.exists ? undefined : t('search.fileGone'),
        })),
      },
      {
        id: 'archive',
        title: t('search.archive'),
        items: found.archive.map((a) => ({
          id: `torrent:${a.id}`,
          label: a.name,
          description: `${categoryName(a.categoryId, categories, tt)} · ${formatSize(a.totalSize, i18n.language)}`,
          icon: <IconArchive size={16} />,
          meta: tt(`archiveState.${a.status}`),
        })),
      },
    ].filter((s) => s.items.length > 0)

  const open = (id: string) => {
    const [kind, ...rest] = id.split(':')
    const value = rest.join(':')
    setQuery('')
    input.current?.blur()
    if (kind === 'series') return openSeries(value)
    if (kind === 'file') {
      const file = results?.library.files.find((f) => String(f.id) === value)
      if (file) void openFile(file)
      return
    }
    const entry = results?.archive.find((a) => String(a.id) === value)
    if (!entry) return
    navigate('downloads')
    if (entry.status === 'inDownloads') {
      downloadsView.set({ tab: 'downloads', category: 'all', selected: entry.id, highlight: null })
    } else {
      // The archive list shows the record whatever was searched there before
      searchArchive('')
      downloadsView.set({ tab: 'archive', category: 'all', highlight: entry.id })
    }
  }

  return (
    <SearchCombo
      label={t('search.label')}
      placeholder={t('search.placeholder')}
      shortcut="Ctrl K"
      value={query}
      onChange={setQuery}
      sections={results ? sections(results) : []}
      onAction={open}
      // Only after the answer for this very query: no «nothing found» while typing
      emptyText={results && results.query === query.trim() ? t('search.empty', { query: results.query }) : undefined}
      clearLabel={t('search.clear')}
      inputRef={input}
      className="ml-2 w-[300px] shrink"
    />
  )
}
