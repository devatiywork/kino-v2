import { cn, IconClock, IconDownload, IconKeyboard, IconLayers, IconPlay, IconSettings, IconSubtitles, Pressable, ScrollArea } from '@kino/ui'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { useScrollSpy } from '../model/useScrollSpy'
import { AppearanceSection } from './sections/AppearanceSection'
import { DownloadsSection } from './sections/DownloadsSection'
import { HotkeysSection } from './sections/HotkeysSection'
import { LibrarySection } from './sections/LibrarySection'
import { PlaybackSection } from './sections/PlaybackSection'
import { SystemSection } from './sections/SystemSection'
import { TracksSection } from './sections/TracksSection'

const SECTIONS = ['appearance', 'playback', 'tracks', 'library', 'downloads', 'hotkeys', 'system'] as const
type SectionId = (typeof SECTIONS)[number]

const ICONS: Record<SectionId, ComponentType<{ size?: number }>> = {
  appearance: IconSettings,
  playback: IconPlay,
  tracks: IconSubtitles,
  library: IconClock,
  downloads: IconDownload,
  hotkeys: IconKeyboard,
  system: IconLayers,
}

/** SPEC 6: settings in one scroll with a menu of sections on the left. Every change applies at once, there is no «Save» */
export function SettingsPage() {
  const { t } = useTranslation('settings')
  const { active, onScroll, go } = useScrollSpy(SECTIONS)

  return (
    <div className="flex h-full">
      <nav aria-label={t('sections')} className="flex w-[250px] shrink-0 flex-col gap-0.5 border-r border-line px-3 py-[22px]">
        <h1 className="px-3 pb-3.5 font-display text-xl font-semibold tracking-display text-fg">{t('title')}</h1>
        {SECTIONS.map((id) => {
          const Icon = ICONS[id]
          return (
            <Pressable
              key={id}
              aria-current={active === id ? 'true' : undefined}
              onPress={() => go(id)}
              className={cn(
                'flex h-[38px] items-center gap-2.5 rounded-md px-3 text-base text-fg-2 transition-colors duration-(--duration-fast)',
                'data-[hovered]:bg-hover data-[hovered]:text-fg',
                active === id && 'bg-raise text-fg data-[hovered]:bg-raise',
              )}
            >
              <Icon size={17} />
              {t(`${id}.title`)}
            </Pressable>
          )
        })}
      </nav>
      <ScrollArea className="min-w-0 flex-1" viewportClassName="px-10 pt-[26px] pb-[120px]" onScroll={onScroll} aria-label={t('title')}>
        <div className="flex max-w-[900px] flex-col gap-[34px]">
          <AppearanceSection />
          <PlaybackSection />
          <TracksSection />
          <LibrarySection />
          <DownloadsSection />
          <HotkeysSection />
          <SystemSection />
        </div>
      </ScrollArea>
    </div>
  )
}
