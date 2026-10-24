import { Button } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { appIpc, type DefaultHandlers } from '../../../shared/ipc/app'
import { SettingRow } from './SettingsLayout'

type Kind = keyof DefaultHandlers

/**
 * SPEC 6 «Открывать видео через Kino», «Kino как обработчик .torrent и magnet:». Windows lets
 * only the user choose the program: the row shows what opens them now and leads to its page.
 * Read again when the window comes back from there
 */
export function DefaultAppsRow({ kinds, label }: { kinds: Kind[]; label: string }) {
  const { t } = useTranslation('settings')
  const [handlers, setHandlers] = useState<DefaultHandlers | null>(null)

  useEffect(() => {
    const load = () =>
      appIpc
        .defaultHandlers()
        .then(setHandlers)
        .catch((e: unknown) => console.error('[settings] default apps', e))
    void load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [])

  const now = (kind: Kind) => {
    const handler = handlers?.[kind]
    if (!handler) return '…'
    if (handler.isKino) return t('defaultApps.kino')
    return handler.name ?? t('defaultApps.none')
  }

  return (
    <SettingRow label={label} hint={kinds.map((kind) => `${t(`defaultApps.kinds.${kind}`)} — ${now(kind)}`).join(' · ')}>
      <Button variant="outline" size="sm" onPress={() => void appIpc.openDefaultApps().catch((e: unknown) => console.error('[settings] default apps', e))}>
        {t('defaultApps.choose')}
      </Button>
    </SettingRow>
  )
}
