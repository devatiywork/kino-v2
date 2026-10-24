import { Button, IconButton, IconFolder, IconPlay } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { EpisodeDots, progressRatio, Thumb } from '../../../entities/library'
import { useOpenVideo } from '../../../features/open-video'
import { libraryIpc, type PrefLabel, type SeriesDetail } from '../../../shared/ipc/library'
import { formatTime } from '../../../shared/lib/formatTime'

function Remembered({ detail }: { detail: SeriesDetail }) {
  const { t } = useTranslation('library')
  const label = (pref: PrefLabel | null, off: string) => (pref == null ? t('notChosen') : pref.kind === 'off' ? off : pref.label)
  return (
    <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5 rounded-lg border border-glass-line bg-glass p-4 text-sm">
      <span className="text-2xs font-semibold tracking-caps text-fg-3 uppercase">{t('remembered')}</span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-fg-3">{t('rememberedAudio')}</dt>
        <dd className="truncate text-fg">{label(detail.audio, t('noSound'))}</dd>
        <dt className="text-fg-3">{t('rememberedSubs')}</dt>
        <dd className="truncate text-fg">{label(detail.subtitles, t('turnedOff'))}</dd>
      </dl>
      <p className="text-xs text-fg-3">{t('rememberedNote')}</p>
    </div>
  )
}

/** Top of the series page: frame, title, season strip, what to watch, the track memory */
export function SeriesHero({ detail }: { detail: SeriesDetail }) {
  const { t } = useTranslation('library')
  const { openFile } = useOpenVideo()
  const all = detail.seasons.flatMap((s) => s.episodes)
  const next = all.find((f) => f.id === detail.nextUp) ?? null
  const season = detail.seasons.find((s) => s.episodes.some((f) => f.id === detail.nextUp)) ?? detail.seasons[detail.seasons.length - 1]
  const frame = next ?? all.filter((f) => f.thumb).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))[0] ?? all[0]
  const first = season?.episodes.find((f) => f.exists)
  const watched = season?.episodes.filter((f) => f.watched).length ?? 0

  return (
    <section className="relative isolate flex min-h-[290px] items-end overflow-hidden rounded-xl">
      {/* No frame yet — a plain panel, not a placeholder icon in the middle of the hero */}
      {frame?.thumb ? <Thumb file={frame} className="absolute inset-0 -z-20" /> : <div className="absolute inset-0 -z-20 bg-panel" />}
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-bg/95 via-bg/75 via-45% to-transparent" />
      <div className="flex w-full flex-wrap items-end gap-6 px-[30px] pt-6 pb-7">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
          <h1 className="font-display text-3xl leading-none font-semibold tracking-display text-fg">{detail.title}</h1>
          <div className="flex flex-wrap gap-2 text-sm text-fg-2">
            {season?.season != null ? <span className="rounded-sm bg-hover px-2 py-0.5">{t('seasonN', { season: season.season })}</span> : null}
            <span className="rounded-sm bg-hover px-2 py-0.5">{t('episodes', { count: all.length })}</span>
            {detail.seasons.length > 1 ? <span className="rounded-sm bg-hover px-2 py-0.5">{t('seasons', { count: detail.seasons.length })}</span> : null}
          </div>
          {season ? (
            <div className="flex max-w-[580px] items-center gap-3.5 text-sm text-fg-2">
              <EpisodeDots className="flex-1" progress={season.episodes.map((f) => (f.watched ? 1 : progressRatio(f.position, f.duration)))} />
              <span className="whitespace-nowrap">{t('watchedOf', { watched, total: season.episodes.length })}</span>
            </div>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-2.5">
            {next && !next.exists ? (
              <span className="self-center text-base text-fg-2">{t('filesGone')}</span>
            ) : next ? (
              <Button variant="primary" size="lg" icon={<IconPlay size={16} />} onPress={() => void openFile(next)}>
                {next.position >= 10 && next.episode != null
                  ? t('playEpisodeFrom', { episode: next.episode, time: formatTime(next.position) })
                  : next.episode != null
                    ? t('playEpisode', { episode: next.episode })
                    : next.title}
              </Button>
            ) : (
              <span className="self-center text-base text-fg-2">{t('allWatched')}</span>
            )}
            {first ? (
              <Button variant="ghost" size="lg" onPress={() => void openFile(first)}>
                {t('fromSeasonStart')}
              </Button>
            ) : null}
            {detail.dir ? (
              <IconButton
                label={t('openInExplorer')}
                size="xl"
                onPress={() => libraryIpc.revealFolder(detail.dir ?? '').catch((e: unknown) => console.error('[library] reveal', e))}
              >
                <IconFolder size={19} />
              </IconButton>
            ) : null}
          </div>
        </div>
        <Remembered detail={detail} />
      </div>
    </section>
  )
}
