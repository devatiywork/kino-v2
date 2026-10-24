import { IconArrowLeft, IconArrowRight, IconButton, IconExternal, IconLock, IconRefresh, TextField } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrackers } from '../../../entities/tracker'
import { appIpc } from '../../../shared/ipc/app'
import { trackersIpc, type BrowserAction } from '../../../shared/ipc/trackers'
import { AdBlockButton } from './AdBlockButton'

/** The browser's own buttons over the site (SPEC 4.5): back, forward, reload, address, «в браузере» */
export function BrowserBar({ onNavigate }: { onNavigate: (url: string) => void }) {
  const { t } = useTranslation('torrents')
  const opened = useTrackers((s) => s.opened)
  const page = useTrackers((s) => s.page)
  const [address, setAddress] = useState(page.url ?? '')
  useEffect(() => setAddress(page.url ?? ''), [page.url])

  const go = (action: BrowserAction) => void trackersIpc.go(action).catch((e: unknown) => console.error('[trackers] go', e))

  return (
    <div className="flex items-center gap-1 border-b border-line px-3 py-2">
      <IconButton label={t('trackers.back')} isDisabled={!opened || !page.canGoBack} onPress={() => go('back')}>
        <IconArrowLeft size={17} />
      </IconButton>
      <IconButton label={t('trackers.forward')} isDisabled={!opened || !page.canGoForward} onPress={() => go('forward')}>
        <IconArrowRight size={17} />
      </IconButton>
      <IconButton label={t('trackers.reload')} isDisabled={!opened} onPress={() => go('reload')}>
        <IconRefresh size={17} className={page.loading ? 'motion-safe:animate-spin' : undefined} />
      </IconButton>
      <TextField
        label={t('trackers.address')}
        showLabel={false}
        value={address}
        onChange={setAddress}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && address.trim()) onNavigate(address.trim())
        }}
        placeholder="https://…"
        mono
        className="mx-1 flex-1"
      />
      <span className="flex items-center gap-1.5 px-2 text-xs whitespace-nowrap text-fg-3">
        <IconLock size={14} />
        {t('trackers.isolated')}
      </span>
      <AdBlockButton />
      <IconButton
        label={t('trackers.openInBrowser')}
        isDisabled={!page.url}
        onPress={() => page.url && void appIpc.openUrl(page.url).catch((e: unknown) => console.error('[trackers] browser', e))}
      >
        <IconExternal size={17} />
      </IconButton>
    </div>
  )
}
