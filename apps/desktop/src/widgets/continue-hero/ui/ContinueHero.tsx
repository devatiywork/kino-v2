import { Button, IconPlay } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { durationText, episodeLine, headline, progressRatio, Thumb } from '../../../entities/library'
import { useOpenVideo } from '../../../features/open-video'
import type { LibraryFile } from '../../../shared/ipc/library'
import { fileName } from '../../../shared/lib/media'
import { formatTime } from '../../../shared/lib/formatTime'

/** The last unfinished file: frame of the stop, episode, progress and «Продолжить с 23:14» */
export function ContinueHero({ file }: { file: LibraryFile }) {
  const { t } = useTranslation('library')
  const { openFile } = useOpenVideo()
  const line = episodeLine(file, t)
  const withHours = (file.duration ?? 0) >= 3600

  return (
    <section className="relative isolate flex min-h-[392px] min-w-0 flex-[999_1_600px] flex-col justify-end overflow-hidden rounded-xl">
      <Thumb file={file} className="absolute inset-0 -z-20" />
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-transparent from-25% via-bg/80 via-70% to-bg" />
      <div className="flex flex-col gap-3.5 px-8 pt-7 pb-[30px]">
        <div className="flex items-center gap-2.5 text-sm text-fg-2">
          <span className="rounded-sm bg-accent-soft px-2 py-1 text-xs font-semibold tracking-caps text-accent-fg uppercase">{t('continue')}</span>
          <span>{file.seriesTitle ? t('series') : t('film')}</span>
        </div>
        <h1 className="font-display text-hero leading-none font-semibold tracking-display text-fg">{headline(file)}</h1>
        <div className="flex flex-wrap items-baseline gap-3">
          {line ? <b className="text-lg font-medium text-fg">{line}</b> : null}
          <span className="truncate font-mono text-xs text-fg-3">{fileName(file.path)}</span>
        </div>
        <div className="flex max-w-[580px] items-center gap-3.5 text-sm text-fg-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-track">
            <div className="h-full bg-accent" style={{ width: `${progressRatio(file.position, file.duration) * 100}%` }} />
          </div>
          <span className="font-mono text-xs text-fg">
            {formatTime(file.position, withHours)} / {formatTime(file.duration, withHours)}
          </span>
          {file.duration ? <span>{t('left', { time: durationText(file.duration - file.position, t) })}</span> : null}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-2.5">
          <Button variant="primary" size="lg" icon={<IconPlay size={16} />} isDisabled={!file.exists} onPress={() => void openFile(file)}>
            {t('continueFrom', { time: formatTime(file.position) })}
          </Button>
          {!file.exists ? <span className="self-center text-sm text-danger">{t('missing')}</span> : null}
        </div>
      </div>
    </section>
  )
}
