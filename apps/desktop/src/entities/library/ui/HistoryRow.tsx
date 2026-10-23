import { IconCheck, Pressable } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import type { HistoryEntry } from '../../../shared/ipc/library'
import { formatTime } from '../../../shared/lib/formatTime'
import { clockTime, episodeBadge, headline, progressRatio } from '../lib/labels'
import { Thumb } from './Thumb'

/** One viewing: time, frame, what, where it stopped */
export function HistoryRow({ entry, onOpen }: { entry: HistoryEntry; onOpen: (entry: HistoryEntry) => void }) {
  const { t, i18n } = useTranslation('library')
  const { file } = entry
  const badge = episodeBadge(file, t)
  const title = badge ? `${headline(file)} · ${badge}` : headline(file)
  const detail = !file.exists ? t('missing') : entry.watched ? t('watched') : t('stoppedAt', { time: formatTime(entry.position) })

  return (
    <Pressable
      aria-label={`${title}, ${detail}`}
      onPress={() => onOpen(entry)}
      className="flex w-full items-center gap-3 rounded-md px-1.5 py-[7px] data-[hovered]:bg-raise"
    >
      <span className="w-10 shrink-0 font-mono text-xs text-fg-3">{clockTime(entry.endedAt, i18n.language)}</span>
      <Thumb file={file} className="h-[30px] w-[52px] shrink-0 rounded-sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        {/* The column is narrow: the episode goes to the second line, the title stays readable */}
        <b className="truncate text-base font-medium text-fg">{headline(file)}</b>
        <span className="truncate text-xs text-fg-4">{badge ? `${badge} · ${detail}` : detail}</span>
      </span>
      {entry.watched ? (
        <IconCheck size={16} className="shrink-0 text-accent" label={t('watched')} />
      ) : (
        <span className="h-1 w-[34px] shrink-0 overflow-hidden rounded-full bg-raise-2">
          <span className="block h-full bg-accent" style={{ width: `${progressRatio(entry.position, file.duration) * 100}%` }} />
        </span>
      )}
    </Pressable>
  )
}
