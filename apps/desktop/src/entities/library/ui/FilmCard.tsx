import { Pressable } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import type { LibraryFile } from '../../../shared/ipc/library'
import { durationText, headline, progressRatio } from '../lib/labels'
import { Thumb } from './Thumb'

/** A film of «Библиотека»: the frame of the last stop, how much is left, watched or not yet */
export function FilmCard({ file, onOpen }: { file: LibraryFile; onOpen: (file: LibraryFile) => void }) {
  const { t } = useTranslation('library')
  const started = file.position > 0 && !file.watched
  const left = started && file.duration ? Math.max(0, file.duration - file.position) : null
  const line = file.watched
    ? t('filmWatched')
    : left != null
      ? t('left', { time: durationText(left, t) })
      : file.duration
        ? durationText(file.duration, t)
        : t('filmNew')

  return (
    <Pressable aria-label={`${headline(file)}, ${line}`} onPress={() => onOpen(file)} className="flex flex-col gap-2.5 rounded-lg">
      <Thumb file={file} className="aspect-video rounded-lg">
        {started ? (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-track">
            <div className="h-full bg-accent" style={{ width: `${progressRatio(file.position, file.duration) * 100}%` }} />
          </div>
        ) : null}
      </Thumb>
      <div className="flex min-w-0 flex-col gap-0.5">
        <b className="truncate text-md font-semibold text-fg">{headline(file)}</b>
        <small className="truncate text-sm text-fg-4">{line}</small>
      </div>
    </Pressable>
  )
}
