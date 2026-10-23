import { IconLink, Pressable } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { downloadsView, hostOf } from '../../../entities/torrent'
import { routeSourcePage } from '../../../entities/tracker'
import { appIpc } from '../../../shared/ipc/app'

/** The release page as its site's name; a click opens it in the browser */
export function SourceLink({ url }: { url: string | null }) {
  const { t } = useTranslation('torrents')
  if (!url) return <span className="text-fg-3">{t('archive.noSource')}</span>
  return (
    <Pressable
      aria-label={`${t('menu.openSource')}: ${url}`}
      onPress={() =>
        routeSourcePage(url)
          ? downloadsView.set({ tab: 'trackers' })
          : void appIpc.openUrl(url).catch((e: unknown) => console.error('[archive] source', e))
      }
      className="inline-flex max-w-full items-center gap-1.5 rounded-xs text-fg-2 data-[hovered]:text-accent-fg"
    >
      <IconLink size={13} className="shrink-0" />
      <span className="truncate">{hostOf(url)}</span>
    </Pressable>
  )
}
