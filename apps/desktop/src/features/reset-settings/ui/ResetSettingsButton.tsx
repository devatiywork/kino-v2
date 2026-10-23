import { Button, ConfirmDialog, useToast } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resetSettings } from '../../../entities/settings'

/** SPEC 6 «Сбросить настройки» — with a confirmation; history and folders stay */
export function ResetSettingsButton() {
  const { t } = useTranslation('settings')
  const { t: tc } = useTranslation()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)

  const reset = async () => {
    try {
      await resetSettings()
      toast.show({ title: t('reset.done'), tone: 'success' })
    } catch (e: unknown) {
      console.error('[settings] reset', e)
      toast.show({ title: String(e), tone: 'danger' })
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onPress={() => setConfirming(true)}>
        {t('reset.button')}
      </Button>
      <ConfirmDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={t('reset.title')}
        description={t('reset.text')}
        confirmLabel={t('reset.confirm')}
        cancelLabel={tc('actions.cancel')}
        tone="danger"
        onConfirm={() => void reset()}
      />
    </>
  )
}
