import { useEffect, useState } from 'react'
import { useSettings } from '../../../entities/settings'
import { folderOf, lastCategory } from '../../../entities/torrent'
import type { AddRequest, Preview } from '../../../shared/ipc/torrents'
import { useAddTorrent } from './addTorrent'

/**
 * The add dialog's choices (SPEC 4.1): the category used last, its folder (until the folder
 * is edited by hand), every file, «Начать сразу» from the settings. A torrent the archive
 * knows starts from its record
 */
export function useAddForm(preview: Preview | null) {
  const startPaused = useSettings((s) => s.startPaused)
  const trackerPage = useAddTorrent((s) => s.sourceUrl)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [folder, setFolder] = useState('')
  const [folderEdited, setFolderEdited] = useState(false)
  const [source, setSource] = useState('')
  const [start, setStart] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!preview) return
    const known = preview.duplicate
    const category = known ? known.categoryId : lastCategory()
    setCategoryId(category)
    setFolder(known ? known.saveDir : folderOf(category))
    setFolderEdited(false)
    // SPEC 4.5: the tracker's page goes into the archive by itself
    setSource(known?.sourceUrl ?? trackerPage ?? '')
    setStart(!startPaused)
    setSelected(new Set(preview.files.map((f) => f.index)))
  }, [preview, startPaused, trackerPage])

  const chooseCategory = (id: number | null) => {
    setCategoryId(id)
    if (!folderEdited) setFolder(folderOf(id))
  }

  const editFolder = (value: string) => {
    setFolder(value)
    setFolderEdited(true)
  }

  const request = (): AddRequest | null => {
    if (!preview || !selected.size || !folder.trim()) return null
    return {
      infoHash: preview.infoHash,
      categoryId,
      saveDir: folder.trim(),
      onlyFiles: selected.size === preview.files.length ? null : [...selected].sort((a, b) => a - b),
      sourceUrl: source.trim() || null,
      start,
    }
  }

  return { categoryId, chooseCategory, folder, editFolder, source, setSource, start, setStart, selected, setSelected, request }
}
