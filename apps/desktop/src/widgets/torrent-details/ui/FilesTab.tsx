import { Button, Checkbox } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { torrentsIpc, type FileProgress } from '../../../shared/ipc/torrents'
import { formatSize } from '../../../shared/lib/formatBytes'

/** «Файлы» (SPEC 4.3): check boxes, size, progress, what is left; unchecked files are not downloaded */
export function FilesTab({ id, files, onChanged }: { id: number; files: FileProgress[]; onChanged: () => void }) {
  const { t, i18n } = useTranslation('torrents')
  const locale = i18n.language

  const choose = (indices: number[]) => {
    if (!indices.length) return
    torrentsIpc
      .setFiles(id, indices)
      .then(onChanged)
      .catch((e: unknown) => console.error('[torrents] files', e))
  }
  const selected = files.filter((f) => f.selected).map((f) => f.index)
  const toggle = (index: number, on: boolean) => choose(on ? [...selected, index].sort((a, b) => a - b) : selected.filter((i) => i !== index))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onPress={() => choose(files.map((f) => f.index))}>
          {t('details.selectAll')}
        </Button>
        <span className="text-sm text-fg-3">{t('details.filesHint')}</span>
      </div>
      {/*
        One grid for every row (rows are display: contents), so the columns line up: the name is
        as wide as the longest one and gives way first; size, progress and what is left always
        stay in view, clear of the scroll bar
      */}
      <div role="table" aria-label={t('details.files')} className="grid grid-cols-[minmax(0,max-content)_auto_minmax(120px,200px)_auto] justify-start pr-4 text-sm">
        <div role="row" className="contents text-xs text-fg-3">
          <span role="columnheader" className="py-1.5">
            {t('details.file')}
          </span>
          <span role="columnheader" className="py-1.5 pl-8 text-right">
            {t('details.size')}
          </span>
          <span role="columnheader" className="py-1.5 pl-6">
            {t('details.progress')}
          </span>
          <span role="columnheader" className="py-1.5 pl-6 text-right">
            {t('details.fileLeft')}
          </span>
        </div>
        {files.map((file) => {
          const ratio = file.size ? Math.min(1, file.done / file.size) : 1
          return (
            <div role="row" key={file.index} className="contents">
              <span role="cell" title={file.path} className="min-w-0 border-t border-line py-1.5">
                <Checkbox
                  isSelected={file.selected}
                  isDisabled={file.selected && selected.length === 1}
                  onChange={(on) => toggle(file.index, on)}
                  className="w-full"
                >
                  {file.path}
                </Checkbox>
              </span>
              <span role="cell" className="flex items-center justify-end border-t border-line py-1.5 pl-8 font-mono text-xs whitespace-nowrap text-fg-2">
                {formatSize(file.size, locale)}
              </span>
              <span role="cell" className="flex items-center gap-2 border-t border-line py-1.5 pl-6">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-track">
                  <span className="block h-full bg-accent" style={{ width: `${ratio * 100}%` }} />
                </span>
                <span className="w-10 text-right font-mono text-xs text-fg-2">{Math.floor(ratio * 100)}%</span>
              </span>
              <span role="cell" className="flex items-center justify-end border-t border-line py-1.5 pl-6 font-mono text-xs whitespace-nowrap text-fg-2">
                {file.selected ? formatSize(file.size - file.done, locale) : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
