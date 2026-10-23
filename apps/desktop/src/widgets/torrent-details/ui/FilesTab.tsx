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
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-fg-3">
          <tr>
            <th className="py-1.5 font-normal">{t('details.file')}</th>
            <th className="w-24 py-1.5 text-right font-normal">{t('details.size')}</th>
            <th className="w-44 py-1.5 pl-5 font-normal">{t('details.progress')}</th>
            <th className="w-24 py-1.5 text-right font-normal">{t('details.fileLeft')}</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const ratio = file.size ? Math.min(1, file.done / file.size) : 1
            return (
              <tr key={file.index} className="border-t border-line">
                <td className="max-w-0 py-1.5">
                  <Checkbox
                    isSelected={file.selected}
                    isDisabled={file.selected && selected.length === 1}
                    onChange={(on) => toggle(file.index, on)}
                    className="w-full"
                  >
                    {file.path}
                  </Checkbox>
                </td>
                <td className="py-1.5 text-right font-mono text-xs text-fg-2">{formatSize(file.size, locale)}</td>
                <td className="py-1.5 pl-5">
                  <span className="flex items-center gap-2">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-track">
                      <span className="block h-full bg-accent" style={{ width: `${ratio * 100}%` }} />
                    </span>
                    <span className="w-12 text-right font-mono text-xs text-fg-2">{Math.floor(ratio * 100)}%</span>
                  </span>
                </td>
                <td className="py-1.5 text-right font-mono text-xs text-fg-2">{file.selected ? formatSize(file.size - file.done, locale) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
