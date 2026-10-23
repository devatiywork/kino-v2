import { Button, Dialog, Modal, TextField } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOverlayTriggerState } from 'react-stately'
import { torrentsIpc } from '../../../shared/ipc/torrents'

interface SourceDialogProps {
  /** The record; null — closed */
  id: number | null
  url: string | null
  onClose: () => void
  onSaved?: () => void
}

/** «Страница раздачи»: the link is kept in the archive (SPEC 4.4) */
export function SourceDialog({ id, url, onClose, onSaved }: SourceDialogProps) {
  const { t } = useTranslation('torrents')
  const { t: tc } = useTranslation()
  const state = useOverlayTriggerState({ isOpen: id != null, onOpenChange: (open) => !open && onClose() })
  const [value, setValue] = useState('')

  useEffect(() => {
    if (id != null) setValue(url ?? '')
  }, [id, url])

  const save = async () => {
    if (id == null) return
    try {
      await torrentsIpc.setSource(id, value.trim() || null)
      onSaved?.()
      state.close()
    } catch (e: unknown) {
      console.error('[torrents] source', e)
    }
  }

  return (
    <Modal state={state}>
      <Dialog
        title={t('source.title')}
        className="w-[560px]"
        actions={
          <>
            <Button variant="secondary" onPress={state.close}>
              {tc('actions.cancel')}
            </Button>
            <Button variant="primary" onPress={() => void save()}>
              {t('source.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 pt-1">
          <p>{t('source.text')}</p>
          <TextField label={t('source.label')} value={value} onChange={setValue} placeholder="https://…" mono autoFocus />
        </div>
      </Dialog>
    </Modal>
  )
}
