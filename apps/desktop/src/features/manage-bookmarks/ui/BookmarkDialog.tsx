import { Button, Dialog, Modal, TextField } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOverlayTriggerState } from 'react-stately'
import { refreshBookmarks } from '../../../entities/tracker'
import { useCoverNativeLayer } from '../../../shared/lib/nativeLayer'
import { trackersIpc, type Bookmark } from '../../../shared/ipc/trackers'

interface BookmarkDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** null — a new tracker */
  bookmark: Bookmark | null
  onSaved?: (bookmark: Bookmark) => void
}

/** A tracker's name and address: «rutracker.org» is enough, the name comes from the site */
export function BookmarkDialog({ isOpen, onOpenChange, bookmark, onSaved }: BookmarkDialogProps) {
  const { t } = useTranslation('torrents')
  const { t: tc } = useTranslation()
  const state = useOverlayTriggerState({ isOpen, onOpenChange })
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  useCoverNativeLayer(isOpen)

  useEffect(() => {
    if (!isOpen) return
    setTitle(bookmark?.title ?? '')
    setUrl(bookmark?.url ?? '')
    setError(null)
  }, [isOpen, bookmark])

  const save = async () => {
    try {
      const saved = bookmark
        ? (await trackersIpc.updateBookmark(bookmark.id, title, url), { ...bookmark, title, url })
        : await trackersIpc.createBookmark(title, url)
      await refreshBookmarks()
      onSaved?.(saved)
      state.close()
    } catch (e: unknown) {
      setError(String(e))
    }
  }

  return (
    <Modal state={state}>
      <Dialog
        title={bookmark ? t('trackers.editTitle', { title: bookmark.title }) : t('trackers.createTitle')}
        className="w-[520px]"
        actions={
          <>
            <Button variant="secondary" onPress={state.close}>
              {tc('actions.cancel')}
            </Button>
            <Button variant="primary" isDisabled={!url.trim()} onPress={() => void save()}>
              {bookmark ? t('trackers.save') : t('trackers.create')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <TextField
            label={t('trackers.url')}
            value={url}
            onChange={(value) => {
              setUrl(value)
              setError(null)
            }}
            placeholder="https://rutracker.org/forum/index.php"
            isInvalid={error != null}
            errorMessage={error ?? undefined}
            mono
            autoFocus
          />
          <TextField label={t('trackers.title')} value={title} onChange={setTitle} description={t('trackers.titleHint')} />
        </div>
      </Dialog>
    </Modal>
  )
}
