import { Button, Switch } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../entities/settings'
import { appIpc, type UpdateCheck } from '../../../shared/ipc/app'
import { SettingRow } from './SettingsLayout'

type Status = { kind: 'idle' } | { kind: 'checking' } | { kind: 'done'; check: UpdateCheck } | { kind: 'failed'; message: string }

/** SPEC 6 «Обновления»: GitHub Releases only when it is on; «Проверить сейчас» asks at once */
export function UpdatesRow() {
  const { t } = useTranslation('settings')
  const on = useSettings((s) => s.checkUpdates)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const checkNow = async () => {
    setStatus({ kind: 'checking' })
    try {
      setStatus({ kind: 'done', check: await appIpc.checkUpdate() })
    } catch (e: unknown) {
      setStatus({ kind: 'failed', message: String(e) })
    }
  }
  const hint = {
    idle: t('updates.hint'),
    checking: t('updates.checking'),
    done: status.kind === 'done' && status.check.available ? t('updates.available', { version: status.check.latest.version }) : t('updates.latest'),
    failed: status.kind === 'failed' ? t('updates.failed', { message: status.message }) : '',
  }[status.kind]
  const release = status.kind === 'done' && status.check.available ? status.check.latest : null

  return (
    <SettingRow label={t('updates.label')} hint={hint}>
      <div className="flex items-center gap-3">
        {release ? (
          <Button variant="primary" size="sm" onPress={() => void appIpc.openUrl(release.url).catch((e: unknown) => console.error('[settings] release', e))}>
            {t('updates.open')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" isDisabled={status.kind === 'checking'} onPress={() => void checkNow()}>
            {t('updates.checkNow')}
          </Button>
        )}
        <Switch aria-label={t('updates.label')} isSelected={on} onChange={(value) => void updateSettings({ checkUpdates: value })} />
      </div>
    </SettingRow>
  )
}
