import { Button, cn, IconBack10, IconButton, IconForward10, IconPause, IconPlay } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SEEK_STEP, seekBy, togglePause, usePlayback } from '../../../entities/playback'
import { FullscreenButton } from '../../../features/fullscreen'
import { SpeedButton } from '../../../features/playback-speed'
import { SeekBar } from '../../../features/seek'
import { TracksButton } from '../../../features/switch-tracks'
import { VolumeControl } from '../../../features/volume'
import { formatRemaining, formatTime } from '../../../shared/lib/formatTime'

function Times() {
  const position = usePlayback((s) => s.position)
  const duration = usePlayback((s) => s.duration)
  const [showRemaining, setShowRemaining] = useState(true)
  const withHours = (duration ?? 0) >= 3600

  return (
    <div className="mt-0.5 flex items-center font-mono text-xs text-fg">
      <span>{formatTime(position, withHours)}</span>
      <span className="flex-1" />
      <Button variant="ghost" size="sm" className="h-6 px-1.5 font-mono text-xs" onPress={() => setShowRemaining((v) => !v)}>
        {showRemaining ? formatRemaining(position, duration) : formatTime(duration, withHours)}
      </Button>
    </div>
  )
}

/** Bottom controls over the video: progress, times, playback and tracks */
export function PlayerBottomBar({ hidden, onMenuOpenChange }: { hidden: boolean; onMenuOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('player')
  const paused = usePlayback((s) => s.paused)

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-scrim via-scrim/45 to-transparent px-5.5 pt-[90px] pb-4',
        'transition-[opacity,translate] duration-(--duration-base) ease-out',
        hidden && 'pointer-events-none translate-y-3.5 opacity-0 duration-(--duration-slow) ease-in',
      )}
    >
      <SeekBar />
      <Times />
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="flex items-center gap-0.5">
          <IconButton label={paused ? t('play') : t('pause')} variant="solid" size="xl" shortcut={t('spaceKey')} onPress={togglePause}>
            {paused ? <IconPlay size={22} /> : <IconPause size={22} />}
          </IconButton>
          <IconButton label={t('back10')} variant="overlay" size="lg" shortcut="←" onPress={() => seekBy(-SEEK_STEP)}>
            <IconBack10 size={23} />
          </IconButton>
          <IconButton label={t('forward10')} variant="overlay" size="lg" shortcut="→" onPress={() => seekBy(SEEK_STEP)}>
            <IconForward10 size={23} />
          </IconButton>
          <VolumeControl />
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-0.5">
          <TracksButton onOpenChange={onMenuOpenChange} />
          <SpeedButton />
          <FullscreenButton />
        </div>
      </div>
    </div>
  )
}
