import { Button, ConfirmDialog, useToast } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { trackersIpc } from '../../../../../shared/ipc/trackers'
import { SettingRow } from '../../SettingsLayout'
import { SwitchRow } from './fields'

/**
 * «Сохранять пароли сайтов» of the trackers browser and «Удалить сохранённые пароли»: WebView2
 * keeps them encrypted by Windows in Kino's data folder, Kino itself never sees them
 */
export function PasswordRows() {
  const { t } = useTranslation('settings')
  const toast = useToast()
  const [asking, setAsking] = useState(false)
  const clear = async () => {
    await trackersIpc.clearPasswords()
    toast.show({ title: t('downloads.passwordsCleared'), tone: 'success' })
  }
  return (
    <>
      <SwitchRow setting="savePasswords" label={t('downloads.savePasswords')} hint={t('downloads.savePasswordsHint')} />
      <SettingRow label={t('downloads.savedPasswords')} hint={t('downloads.savedPasswordsHint')}>
        <Button variant="outline" size="sm" onPress={() => setAsking(true)}>
          {t('downloads.clearPasswords')}
        </Button>
      </SettingRow>
      <ConfirmDialog
        isOpen={asking}
        onOpenChange={setAsking}
        title={t('downloads.clearPasswordsTitle')}
        description={t('downloads.clearPasswordsText')}
        confirmLabel={t('downloads.clearPasswordsConfirm')}
        cancelLabel={t('downloads.clearPasswordsKeep')}
        tone="danger"
        onConfirm={() =>
          void clear().catch((e: unknown) => toast.show({ title: t('downloads.clearPasswordsFailed', { message: String(e) }), tone: 'danger', duration: 6000 }))
        }
      />
    </>
  )
}
