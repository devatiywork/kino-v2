import { IconButton, IconShield } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../entities/settings'
import { useTrackers } from '../../../entities/tracker'
import { trackersIpc } from '../../../shared/ipc/trackers'

const report = (e: unknown) => console.error('[trackers] ad blocking', e)

/** «Блокировать рекламу» at hand: how many ads this page lost; off and on reload the page */
export function AdBlockButton() {
  const { t } = useTranslation('torrents')
  const on = useSettings((s) => s.blockAds)
  const opened = useTrackers((s) => s.opened)
  const blocked = useTrackers((s) => s.page.blockedAds)
  const toggle = async () => {
    await updateSettings({ blockAds: !on })
    if (opened) await trackersIpc.go('reload')
  }
  return (
    <IconButton
      label={t('trackers.adBlock')}
      tooltip={on ? t('trackers.adBlockOn', { count: blocked }) : t('trackers.adBlockOff')}
      isSelected={on}
      onPress={() => void toggle().catch(report)}
    >
      <span className="relative inline-flex">
        <IconShield size={17} />
        {on && blocked > 0 ? (
          <span aria-hidden="true" className="absolute -top-1.5 -right-2 rounded-full bg-accent px-1 font-mono text-[9px] leading-[13px] text-on-accent">
            {blocked > 99 ? '99+' : blocked}
          </span>
        ) : null}
      </span>
    </IconButton>
  )
}
