import { cn, ConfirmDialog, ContextMenu, IconPlus, Pressable } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CategoryDialog,
  deleteCategory,
  downloadsView,
  matchesCategory,
  useDownloadsView,
  useTorrents,
  type CategoryFilter,
} from '../../../entities/torrent'
import type { Category } from '../../../shared/ipc/torrents'

function Chip({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      aria-pressed={selected}
      onPress={onPress}
      className={cn(
        'flex h-8 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors duration-(--duration-fast)',
        selected ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-panel text-fg-2 data-[hovered]:text-fg',
      )}
    >
      {label}
      <span className="font-mono text-2xs text-fg-3">{count}</span>
    </Pressable>
  )
}

/**
 * SPEC 4.2–4.3: the filter by category and the categories themselves — a right click edits or
 * deletes one (its torrents go to «Без категории»), «Категория» creates a new one
 */
export function CategoryBar({ items }: { items: readonly { categoryId: number | null }[] }) {
  const { t, i18n } = useTranslation('torrents')
  const categories = useTorrents((s) => s.categories)
  const filter = useDownloadsView((s) => s.category)
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  const [removing, setRemoving] = useState<Category | null>(null)
  const count = (f: CategoryFilter) => items.filter((i) => matchesCategory(f, i.categoryId)).length
  const choose = (f: CategoryFilter) => downloadsView.set({ category: f })

  const remove = async (category: Category) => {
    try {
      await deleteCategory(category.id)
      if (downloadsView.get().category === category.id) choose('all')
    } catch (e: unknown) {
      console.error('[torrents] delete category', e)
    }
  }

  return (
    <div role="group" aria-label={t('categories')} className="flex flex-wrap items-center gap-2">
      <Chip label={t('allCategories')} count={items.length} selected={filter === 'all'} onPress={() => choose('all')} />
      {categories.map((category) => (
        <ContextMenu
          key={category.id}
          label={t('category.menu', { name: category.name })}
          items={[
            { id: 'edit', label: t('category.edit') },
            { id: 'delete', label: t('category.delete'), tone: 'danger', separatorBefore: true },
          ]}
          onAction={(key) => (key === 'edit' ? setEditing(category) : setRemoving(category))}
        >
          <Chip label={category.name} count={count(category.id)} selected={filter === category.id} onPress={() => choose(category.id)} />
        </ContextMenu>
      ))}
      {count('none') || filter === 'none' ? <Chip label={t('noCategory')} count={count('none')} selected={filter === 'none'} onPress={() => choose('none')} /> : null}
      <Pressable
        aria-label={`${t('newCategory')}: ${t('category.createTitle')}`}
        onPress={() => setEditing(null)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-dashed border-line-2 px-3 text-sm text-fg-3 data-[hovered]:text-fg"
      >
        <IconPlus size={14} />
        {t('newCategory')}
      </Pressable>
      <CategoryDialog isOpen={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} category={editing ?? null} />
      <ConfirmDialog
        isOpen={removing != null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('category.deleteTitle', { name: removing?.name ?? '' })}
        description={t('category.deleteText')}
        confirmLabel={t('category.delete')}
        cancelLabel={i18n.t('actions.cancel', { ns: 'common' })}
        tone="danger"
        onConfirm={() => removing && void remove(removing)}
      />
    </div>
  )
}
