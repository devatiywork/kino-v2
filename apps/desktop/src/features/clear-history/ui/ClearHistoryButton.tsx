import { Button, ConfirmDialog, IconTrash, useToast } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsIpc } from '../../../shared/ipc/settings'

/** SPEC 6 «Очистить историю» — only after a confirmation; library folders stay */
export function ClearHistoryButton() {
  const { t } = useTranslation('settings')
  const { t: tc } = useTranslation()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)

  const clear = async () => {
    try {
      await settingsIpc.clearHistory()
      toast.show({ title: t('library.cleared'), tone: 'success' })
    } catch (e: unknown) {
      console.error('[library] clear history', e)
      toast.show({ title: String(e), tone: 'danger' })
    }
  }

  return (
    <>
      <Button variant="danger" size="sm" icon={<IconTrash size={14} />} onPress={() => setConfirming(true)}>
        {t('library.clearButton')}
      </Button>
      <ConfirmDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={t('library.clearTitle')}
        description={t('library.clearText')}
        confirmLabel={t('library.clearButton')}
        cancelLabel={tc('actions.cancel')}
        tone="danger"
        onConfirm={() => void clear()}
      />
    </>
  )
}
