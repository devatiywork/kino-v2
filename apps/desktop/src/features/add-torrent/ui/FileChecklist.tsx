import { Checkbox, ScrollArea } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import type { TorrentFile } from '../../../shared/ipc/torrents'
import { formatSize } from '../../../shared/lib/formatBytes'

interface FileChecklistProps {
  files: readonly TorrentFile[]
  selected: ReadonlySet<number>
  onChange: (selected: Set<number>) => void
  isDisabled?: boolean
}

/** SPEC 4.1: the files with check boxes — not everything has to be downloaded */
export function FileChecklist({ files, selected, onChange, isDisabled }: FileChecklistProps) {
  const { t, i18n } = useTranslation('torrents')
  const locale = i18n.language
  const chosen = files.filter((f) => selected.has(f.index))
  const size = chosen.reduce((sum, f) => sum + f.size, 0)

  const toggle = (index: number, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(index)
    else next.delete(index)
    onChange(next)
  }

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
        <ul className="flex flex-col gap-1">
          {files.map((file) => (
            <li key={file.index} className="flex items-center gap-3">
              <Checkbox isSelected={selected.has(file.index)} isDisabled={isDisabled} onChange={(on) => toggle(file.index, on)} className="min-w-0 flex-1">
                {file.path}
              </Checkbox>
              <span className="shrink-0 font-mono text-xs text-fg-3">{formatSize(file.size, locale)}</span>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}
