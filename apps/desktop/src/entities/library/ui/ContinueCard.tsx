import { Pressable } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import type { LibraryFile } from '../../../shared/ipc/library'
import { durationText, episodeBadge, episodeLine, headline, progressRatio } from '../lib/labels'
import { Thumb } from './Thumb'

/** Card in «Не досмотрено»: frame, episode, time left, progress */
export function ContinueCard({ file, onOpen }: { file: LibraryFile; onOpen: (file: LibraryFile) => void }) {
  const { t } = useTranslation('library')
  const badge = episodeBadge(file, t)
  const left = file.duration ? Math.max(0, file.duration - file.position) : null
  const line = episodeLine(file, t) ?? (file.duration ? `${t('film')} · ${durationText(file.duration, t)}` : t('film'))

  return (
    <Pressable aria-label={`${t('continue')}: ${headline(file)}${badge ? `, ${badge}` : ''}`} onPress={() => onOpen(file)} className="flex flex-col gap-2.5 rounded-lg">
      <Thumb file={file} className="aspect-video rounded-lg">
        {badge ? <span className="absolute top-2 left-2 rounded-sm bg-glass px-1.5 py-0.5 font-mono text-2xs font-medium text-fg">{badge}</span> : null}
        {left != null ? (
          <span className="absolute right-2 bottom-3 rounded-sm bg-glass px-1.5 py-0.5 text-2xs font-medium text-fg">
            {t('leftShort', { time: durationText(left, t) })}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-track">
          <div className="h-full bg-accent" style={{ width: `${progressRatio(file.position, file.duration) * 100}%` }} />
        </div>
      </Thumb>
      <div className="flex min-w-0 flex-col gap-0.5">
        <b className="truncate text-md font-semibold text-fg">{headline(file)}</b>
        <small className="truncate text-sm text-fg-4">{file.exists ? line : t('missing')}</small>
      </div>
    </Pressable>
  )
}
