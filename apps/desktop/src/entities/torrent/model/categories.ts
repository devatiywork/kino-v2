import { torrentsIpc, type Category } from '../../../shared/ipc/torrents'
import { refreshCategories, torrentsStore } from './torrentsStore'

/** Empty folder — `<downloads folder>\<name>` */
export async function createCategory(name: string, folder: string): Promise<Category> {
  const created = await torrentsIpc.createCategory(name, folder.trim() || null)
  await refreshCategories()
  return created
}

export async function updateCategory(id: number, name: string, folder: string): Promise<void> {
  await torrentsIpc.updateCategory(id, name, folder.trim() || null)
  await refreshCategories()
}

/** Its torrents go to «Без категории» */
export async function deleteCategory(id: number): Promise<void> {
  await torrentsIpc.deleteCategory(id)
  await refreshCategories()
}

/** Where a download of the category goes; null — «Без категории» */
export function folderOf(categoryId: number | null): string {
  const { categories, downloadsFolder } = torrentsStore.get()
  return categories.find((c) => c.id === categoryId)?.folder ?? downloadsFolder
}

const LAST_CATEGORY = 'kino.torrents.lastCategory'

/** SPEC 4.1: the add dialog offers the category used last */
export function lastCategory(): number | null {
  try {
    const stored = localStorage.getItem(LAST_CATEGORY)
    const id = stored == null || stored === 'none' ? null : Number(stored)
    const { categories } = torrentsStore.get()
    if (id == null) return stored === 'none' ? null : (categories[0]?.id ?? null)
    return categories.some((c) => c.id === id) ? id : (categories[0]?.id ?? null)
  } catch (e: unknown) {
    console.warn('[torrents] last category', e)
    return torrentsStore.get().categories[0]?.id ?? null
  }
}

export function rememberCategory(id: number | null): void {
  try {
    localStorage.setItem(LAST_CATEGORY, id == null ? 'none' : String(id))
  } catch (e: unknown) {
    console.warn('[torrents] remember category', e)
  }
}
