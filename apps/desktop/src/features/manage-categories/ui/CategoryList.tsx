import { Button, ConfirmDialog, IconFolder, IconPlus } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CategoryDialog, deleteCategory, useTorrents } from '../../../entities/torrent'
import type { Category } from '../../../shared/ipc/torrents'

/** SPEC 6 «Категории и их папки»: a new download of a category goes to its folder */
export function CategoryList() {
  const { t, i18n } = useTranslation('torrents')
  const categories = useTorrents((s) => s.categories)
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  const [removing, setRemoving] = useState<Category | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={t('categories')} className="flex flex-col gap-1.5">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-3 rounded-md bg-field py-1.5 pr-1.5 pl-3">
            <b className="w-32 shrink-0 truncate text-sm font-medium text-fg">{category.name}</b>
            <IconFolder size={14} className="shrink-0 text-fg-3" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2">{category.folder}</span>
            <Button variant="ghost" size="sm" onPress={() => setEditing(category)}>
              {t('category.edit')}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => setRemoving(category)}>
              {t('category.delete')}
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="outline" size="sm" icon={<IconPlus size={14} />} onPress={() => setEditing(null)}>
          {t('category.createTitle')}
        </Button>
      </div>
      <CategoryDialog isOpen={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} category={editing ?? null} />
      <ConfirmDialog
        isOpen={removing != null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('category.deleteTitle', { name: removing?.name ?? '' })}
        description={t('category.deleteText')}
        confirmLabel={t('category.delete')}
        cancelLabel={i18n.t('actions.cancel', { ns: 'common' })}
        tone="danger"
        onConfirm={() => removing && void deleteCategory(removing.id).catch((e: unknown) => console.error('[torrents] delete category', e))}
      />
    </div>
  )
}
