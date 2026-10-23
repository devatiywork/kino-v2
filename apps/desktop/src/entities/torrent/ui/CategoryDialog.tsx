import { Button, Dialog, Modal, TextField } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOverlayTriggerState } from 'react-stately'
import { appIpc } from '../../../shared/ipc/app'
import type { Category } from '../../../shared/ipc/torrents'
import { createCategory, updateCategory } from '../model/categories'
import { useTorrents } from '../model/torrentsStore'

interface CategoryDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** null — a new category */
  category: Category | null
  /** The new or changed category */
  onSaved?: (id: number) => void
}

/** SPEC 4.2: a category's name and default folder (empty — `<downloads folder>\<name>`) */
export function CategoryDialog({ isOpen, onOpenChange, category, onSaved }: CategoryDialogProps) {
  const { t } = useTranslation('torrents')
  const { t: tc } = useTranslation()
  const state = useOverlayTriggerState({ isOpen, onOpenChange })
  const downloadsFolder = useTorrents((s) => s.downloadsFolder)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setName(category?.name ?? '')
    setFolder(category?.customFolder ? category.folder : '')
    setError(null)
  }, [isOpen, category])

  const browse = async () => {
    const picked = await appIpc.pickFolder(t('category.folder'))
    if (picked) setFolder(picked)
  }

  const save = async () => {
    try {
      const id = category ? (await updateCategory(category.id, name, folder), category.id) : (await createCategory(name, folder)).id
      onSaved?.(id)
      state.close()
    } catch (e: unknown) {
      setError(String(e))
    }
  }

  const fallback = `${downloadsFolder}\\${name.trim() || '…'}`
  return (
    <Modal state={state}>
      <Dialog
        title={category ? t('category.editTitle', { name: category.name }) : t('category.createTitle')}
        className="w-[520px]"
        actions={
          <>
            <Button variant="secondary" onPress={state.close}>
              {tc('actions.cancel')}
            </Button>
            <Button variant="primary" isDisabled={!name.trim()} onPress={() => void save()}>
              {category ? t('category.save') : t('category.create')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <TextField
            label={t('category.name')}
            value={name}
            onChange={(value) => {
              setName(value)
              setError(null)
            }}
            isInvalid={error != null}
            errorMessage={error ?? undefined}
            autoFocus
          />
          <TextField
            label={t('category.folder')}
            value={folder}
            onChange={setFolder}
            placeholder={fallback}
            description={t('category.folderHint', { folder: fallback })}
            mono
            addon={
              <Button variant="ghost" size="sm" onPress={() => void browse()}>
                {t('add.browse')}
              </Button>
            }
          />
        </div>
      </Dialog>
    </Modal>
  )
}
