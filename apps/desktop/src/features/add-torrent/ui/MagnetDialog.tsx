import { Button, Dialog, Modal, TextField } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOverlayTriggerState } from 'react-stately'
import { closeMagnetDialog, submitMagnet, useAddTorrent } from '../model/addTorrent'

/** «Magnet-ссылка»: paste, and Kino asks the peers for the torrent's files */
export function MagnetDialog() {
  const { t } = useTranslation('torrents')
  const { t: tc } = useTranslation()
  const open = useAddTorrent((s) => s.magnetOpen)
  const resolving = useAddTorrent((s) => s.resolving)
  const error = useAddTorrent((s) => s.magnetError)
  const state = useOverlayTriggerState({ isOpen: open, onOpenChange: (isOpen) => !isOpen && closeMagnetDialog() })
  const [text, setText] = useState('')

  useEffect(() => {
    if (open) setText('')
  }, [open])

  const submit = () => void submitMagnet(text, t('magnet.invalid'))

  return (
    <Modal state={state}>
      <Dialog
        title={t('magnet.title')}
        className="w-[560px]"
        actions={
          <>
            <Button variant="secondary" onPress={state.close}>
              {tc('actions.cancel')}
            </Button>
            <Button variant="primary" isDisabled={!text.trim() || resolving} onPress={submit}>
              {t('magnet.next')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 pt-1">
          <TextField
            label={t('magnet.label')}
            placeholder={t('magnet.placeholder')}
            value={text}
            onChange={setText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            isInvalid={error != null}
            errorMessage={error ?? undefined}
            isDisabled={resolving}
            mono
            autoFocus
          />
          {resolving ? (
            <p role="status" className="text-sm text-fg-2">
              {t('magnet.resolving')}
            </p>
          ) : null}
        </div>
      </Dialog>
    </Modal>
  )
}
