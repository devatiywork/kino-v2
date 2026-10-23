import type { MenuItemData } from '@kino/ui'
import { appIpc } from '../../../shared/ipc/app'
import { torrentsIpc, type Category } from '../../../shared/ipc/torrents'

type T = (key: string, options?: Record<string, unknown>) => string

/** The content in Explorer: the file or the torrent's folder; not there yet — its parent folder */
export async function revealContent(contentPath: string, saveDir: string): Promise<void> {
  try {
    await appIpc.revealPath(contentPath)
  } catch (e: unknown) {
    console.warn('[torrents] content not on disk yet', e)
    await appIpc.revealPath(saveDir)
  }
}

export async function copyMagnet(id: number): Promise<void> {
  await appIpc.copyText(await torrentsIpc.magnet(id))
}

/** Menu items «Категория: …» — the current one ticked; ids `cat:<id>` and `cat:none` */
export function categoryItems(current: number | null, categories: readonly Category[], t: T): MenuItemData[] {
  const options: { id: string; name: string; selected: boolean }[] = [
    ...categories.map((c) => ({ id: `cat:${c.id}`, name: c.name, selected: c.id === current })),
    { id: 'cat:none', name: t('noCategory'), selected: current == null },
  ]
  return options.map((o, index) => ({
    id: o.id,
    label: t('menu.category', { name: o.name }),
    isDisabled: o.selected,
    separatorBefore: index === 0,
  }))
}

/** `cat:7` → 7, `cat:none` → null, anything else — not a category item */
export function categoryOfItem(key: string): number | null | undefined {
  if (!key.startsWith('cat:')) return undefined
  const value = key.slice(4)
  return value === 'none' ? null : Number(value)
}
