import { cn, IconButton, IconClose, IconFolder } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { libraryIpc, type Folder } from '../../../shared/ipc/library'

/** Library folders as chips; removing one keeps the history, only unplayed series disappear */
export function FolderList({ folders }: { folders: Folder[] }) {
  const { t } = useTranslation('library')
  if (!folders.length) return null
  return (
    <ul aria-label={t('folders')} className="flex flex-wrap gap-2">
      {folders.map((folder) => (
        <li
          key={folder.id}
          className={cn('flex h-8 items-center gap-2 rounded-md border border-line bg-panel pr-1 pl-2.5 font-mono text-xs text-fg-2', !folder.exists && 'opacity-60')}
        >
          <IconFolder size={14} className="text-fg-3" />
          <span className="max-w-[420px] truncate">{folder.path}</span>
          {!folder.exists ? <span className="font-sans text-danger">{t('folderMissing')}</span> : null}
          <IconButton
            label={`${t('removeFolder')}: ${folder.path}`}
            tooltip={t('removeFolder')}
            size="sm"
            className="size-6"
            onPress={() => libraryIpc.removeFolder(folder.id).catch((e: unknown) => console.error('[library] remove folder', e))}
          >
            <IconClose size={12} />
          </IconButton>
        </li>
      ))}
    </ul>
  )
}
