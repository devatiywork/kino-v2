import { Checkbox, IconChevronDown, IconButton, IconFolder } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { formatSize } from '../../../shared/lib/formatBytes'
import { folderState, toggleFiles, type FolderNode, type TreeNode } from '../model/fileTree'

interface FileTreeProps {
  nodes: readonly TreeNode[]
  depth?: number
  selected: ReadonlySet<number>
  onChange: (selected: Set<number>) => void
  open: ReadonlySet<string>
  onToggleOpen: (path: string) => void
  /** Files already on disk (a torrent the archive knows) */
  have?: ReadonlySet<number>
  isDisabled?: boolean
}

/** Indentation per level: the folder's arrow and the file's box stay in one column */
const indent = (depth: number) => ({ paddingLeft: depth * 20 })

function FolderRow({ folder, depth, ...props }: Omit<FileTreeProps, 'nodes'> & { folder: FolderNode; depth: number }) {
  const { t, i18n } = useTranslation('torrents')
  const state = folderState(folder, props.selected)
  const isOpen = props.open.has(folder.path)
  return (
    <li>
      <div className="flex items-center gap-1.5" style={indent(depth)}>
        <IconButton size="sm" label={t(isOpen ? 'add.collapse' : 'add.expand', { name: folder.name })} tooltip={false} onPress={() => props.onToggleOpen(folder.path)} className="-ml-1.5 size-6">
          <IconChevronDown size={14} className={isOpen ? '' : '-rotate-90'} />
        </IconButton>
        <Checkbox
          isSelected={state === 'all'}
          isIndeterminate={state === 'some'}
          isDisabled={props.isDisabled}
          onChange={(on) => props.onChange(toggleFiles(props.selected, folder.files, on))}
          className="min-w-0 flex-1"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <IconFolder size={15} className="shrink-0 text-fg-3" />
            <span className="truncate font-medium">{folder.name}</span>
            <span className="shrink-0 text-xs text-fg-3">{t('files', { count: folder.files.length })}</span>
          </span>
        </Checkbox>
        <span className="shrink-0 font-mono text-xs text-fg-3">{formatSize(folder.size, i18n.language)}</span>
      </div>
      {isOpen ? <FileTree nodes={folder.children} depth={depth + 1} {...props} /> : null}
    </li>
  )
}

/** SPEC 4.1: the torrent's folders and files with check boxes; a folder's box takes all of it */
export function FileTree({ nodes, depth = 0, ...props }: FileTreeProps) {
  const { t, i18n } = useTranslation('torrents')
  return (
    <ul className="flex flex-col gap-1">
      {nodes.map((node) =>
        node.kind === 'folder' ? (
          <FolderRow key={node.path} folder={node} depth={depth} {...props} />
        ) : (
          <li key={node.file.index} className="flex items-center gap-3" style={indent(depth)}>
            <Checkbox
              isSelected={props.selected.has(node.file.index)}
              isDisabled={props.isDisabled}
              onChange={(on) => props.onChange(toggleFiles(props.selected, [node.file.index], on))}
              className="min-w-0 flex-1"
            >
              <span className="truncate">{node.name}</span>
            </Checkbox>
            {props.have?.has(node.file.index) ? <span className="shrink-0 text-xs text-fg-3">{t('add.onDisk')}</span> : null}
            <span className="shrink-0 font-mono text-xs text-fg-3">{formatSize(node.file.size, i18n.language)}</span>
          </li>
        ),
      )}
    </ul>
  )
}
