import { IconLink, Pressable } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { downloadsView, hostOf } from '../../../entities/torrent'
import { openInTrackers } from '../../../entities/tracker'

/** The release page as its site's name; a click opens it in the trackers tab */
export function SourceLink({ url }: { url: string | null }) {
  const { t } = useTranslation('torrents')
  if (!url) return <span className="text-fg-3">{t('archive.noSource')}</span>
  return (
    <Pressable
      aria-label={`${t('menu.openSource')}: ${url}`}
      onPress={() => {
        openInTrackers(url)
        downloadsView.set({ tab: 'trackers' })
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-xs text-fg-2 data-[hovered]:text-accent-fg"
    >
      <IconLink size={13} className="shrink-0" />
      <span className="truncate">{hostOf(url)}</span>
    </Pressable>
  )
}
