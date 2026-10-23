import { cn, IconCheck, Pressable } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import type { LibraryFile } from '../../../shared/ipc/library'
import { fileName } from '../../../shared/lib/media'
import { formatTime } from '../../../shared/lib/formatTime'
import { progressRatio } from '../lib/labels'
import { Thumb } from './Thumb'

/** An episode in the series list: number, frame, file, duration, status (SPEC 3.3) */
export function EpisodeRow({
  file,
  isCurrent,
  compact,
  onOpen,
}: {
  file: LibraryFile
  /** The episode to watch next (series page) or the one playing (player panel) */
  isCurrent: boolean
  /** Player side panel: no duration and status columns */
  compact?: boolean
  onOpen: (file: LibraryFile) => void
}) {
  const { t } = useTranslation('library')
  const ratio = file.watched ? 1 : progressRatio(file.position, file.duration)
  const number = file.episode != null ? String(file.episode).padStart(2, '0') : '—'
  const status = !file.exists
    ? t('missing')
    : file.watched
      ? t('statusWatched')
      : file.position >= 10
        ? file.duration
          ? t('statusProgress', { time: formatTime(file.position), total: formatTime(file.duration) })
          : t('statusStopped', { time: formatTime(file.position) })
        : t('statusNew')
  const name = file.episode != null ? t('playEpisode', { episode: file.episode }) : file.title

  return (
    <Pressable
      aria-label={`${name}, ${status}`}
      aria-current={isCurrent || undefined}
      isDisabled={!file.exists}
      onPress={() => onOpen(file)}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-md px-2.5 py-2 data-[hovered]:bg-raise data-[disabled]:opacity-50',
        isCurrent && 'bg-accent-soft data-[hovered]:bg-accent-soft',
      )}
    >
      <span className="w-6 shrink-0 text-right font-mono text-sm text-fg-3">{number}</span>
      <Thumb file={file} className={cn('shrink-0 rounded-sm', compact ? 'h-9 w-16' : 'h-[46px] w-[82px]')}>
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-track">
          <span className="block h-full bg-accent" style={{ width: `${ratio * 100}%` }} />
        </span>
      </Thumb>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <b className="flex items-center gap-2.5 text-md font-semibold text-fg">
          {name}
          {isCurrent ? <span className="rounded-sm bg-accent px-1.5 py-px text-2xs font-semibold text-on-accent uppercase">{t('now')}</span> : null}
        </b>
        <span className="truncate font-mono text-2xs text-fg-3">{compact ? status : fileName(file.path)}</span>
      </span>
      {compact ? null : (
        <>
          <span className="w-[70px] shrink-0 text-right font-mono text-sm text-fg-4">{file.duration ? formatTime(file.duration) : ''}</span>
          <span className={cn('flex w-[200px] shrink-0 items-center justify-end gap-2 text-sm text-fg-3', file.watched && 'text-fg-2')}>
            {file.watched ? <IconCheck size={16} className="text-accent" /> : null}
            {status}
          </span>
        </>
      )}
    </Pressable>
  )
}
