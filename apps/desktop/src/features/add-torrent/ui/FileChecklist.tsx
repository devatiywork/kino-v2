import { Checkbox, ScrollArea } from '@kino/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TorrentFile } from '../../../shared/ipc/torrents'
import { formatSize } from '../../../shared/lib/formatBytes'
import { buildTree, initiallyOpen } from '../model/fileTree'
import { FileTree } from './FileTree'

interface FileChecklistProps {
  files: readonly TorrentFile[]
  selected: ReadonlySet<number>
  onChange: (selected: Set<number>) => void
  /** Files already on disk (a torrent the archive knows) */
  have?: ReadonlySet<number>
  isDisabled?: boolean
}

/** SPEC 4.1: the files with check boxes, by folder (a season at once) — not everything has to be downloaded */
export function FileChecklist({ files, selected, onChange, have, isDisabled }: FileChecklistProps) {
  const { t, i18n } = useTranslation('torrents')
  const locale = i18n.language
  const tree = useMemo(() => buildTree(files), [files])
  const [open, setOpen] = useState(() => initiallyOpen(tree, files.length))
  const chosen = files.filter((f) => selected.has(f.index))
  const size = chosen.reduce((sum, f) => sum + f.size, 0)

  const toggleOpen = (path: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <div className="flex min-h-0 flex-col gap-2 rounded-lg border border-line bg-field">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        <Checkbox
          isSelected={chosen.length === files.length}
          isIndeterminate={chosen.length > 0 && chosen.length < files.length}
          isDisabled={isDisabled}
          onChange={(on) => onChange(new Set(on ? files.map((f) => f.index) : []))}
        >
          {t('add.allFiles')}
        </Checkbox>
        <span className="ml-auto font-mono text-xs text-fg-3">
          {t('add.selected', { count: chosen.length, total: files.length, size: formatSize(size, locale) })}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="px-3 pb-2" viewportStyle={{ maxHeight: 300 }} aria-label={t('add.files')}>
        <FileTree nodes={tree} selected={selected} onChange={onChange} open={open} onToggleOpen={toggleOpen} have={have} isDisabled={isDisabled} />
      </ScrollArea>
    </div>
  )
}
