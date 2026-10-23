import { IconSubtitles, ListBox, PopoverButton } from '@kino/ui'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { selectAudio, selectSubtitle, usePlayback } from '../../../entities/playback'
import { trackByKey, trackItems, trackKey, type TrackListLabels } from '../lib/trackItems'

/** Audio and subtitles in one window: two lists side by side, switching without reloading the video */
export function TracksButton({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const { t, i18n } = useTranslation('player')
  const tracks = usePlayback((s) => s.tracks)
  const audioId = usePlayback((s) => s.audioId)
  const subtitleId = usePlayback((s) => s.subtitleId)
  const subtitlesVisible = usePlayback((s) => s.subtitlesVisible)

  const { audio, subtitles } = useMemo(() => {
    const labels = (off: string): TrackListLabels => ({
      off,
      external: t('tracks.external'),
      unknown: (id) => t('tracks.unknown', { id }),
    })
    return {
      audio: trackItems(tracks, 'audio', i18n.language, labels(t('tracks.noAudio'))),
      subtitles: trackItems(tracks, 'sub', i18n.language, labels(t('tracks.off'))),
    }
  }, [tracks, t, i18n.language])

  const current = audio.find((a) => a.id === trackKey(audioId))?.label

  return (
    <PopoverButton
      label={t('tracks.button')}
      variant="overlay"
      icon={<IconSubtitles size={20} />}
      placement="top end"
      onOpenChange={onOpenChange}
      // Over the video: an opaque surface, backdrop blur does not reach mpv's window
      popoverClassName="w-[600px] bg-panel p-3.5"
      content={
        <div className="grid grid-cols-2 gap-3.5">
          <section>
            <h3 className="px-2 pb-2 text-2xs font-semibold tracking-caps text-fg-3 uppercase">{t('tracks.audio')}</h3>
            <ListBox
              aria-label={t('tracks.audio')}
              items={audio}
              selectedKey={trackKey(audioId)}
              onSelectionChange={(key) => selectAudio(trackByKey(tracks, 'audio', String(key)))}
            />
          </section>
          <section>
            <h3 className="px-2 pb-2 text-2xs font-semibold tracking-caps text-fg-3 uppercase">{t('tracks.subtitles')}</h3>
            <ListBox
              aria-label={t('tracks.subtitles')}
              items={subtitles}
              selectedKey={trackKey(subtitlesVisible ? subtitleId : null)}
              onSelectionChange={(key) => selectSubtitle(trackByKey(tracks, 'sub', String(key)))}
            />
          </section>
        </div>
      }
    >
      {current ? (
        <span className="max-w-40 truncate">
          <span className="sr-only">{t('tracks.button')}: </span>
          {current}
        </span>
      ) : null}
    </PopoverButton>
  )
}
