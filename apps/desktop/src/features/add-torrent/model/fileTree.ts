import type { TorrentFile } from '../../../shared/ipc/torrents'

export interface FolderNode {
  kind: 'folder'
  name: string
  /** «Season 2\Extras»: the key of its open / closed state */
  path: string
  children: TreeNode[]
  /** Every file below it, at any depth */
  files: number[]
  size: number
}

export interface FileNode {
  kind: 'file'
  name: string
  file: TorrentFile
}

export type TreeNode = FolderNode | FileNode

/** The torrent's files as folders and files, in the torrent's own order */
export function buildTree(files: readonly TorrentFile[]): TreeNode[] {
  const root: FolderNode = { kind: 'folder', name: '', path: '', children: [], files: [], size: 0 }
  for (const file of files) {
    const parts = file.path.split(/[\\/]/)
    let folder = root
    folder.files.push(file.index)
    folder.size += file.size
    for (const name of parts.slice(0, -1)) {
      const path = folder.path ? `${folder.path}\\${name}` : name
      let next = folder.children.find((c): c is FolderNode => c.kind === 'folder' && c.name === name)
      if (!next) {
        next = { kind: 'folder', name, path, children: [], files: [], size: 0 }
        folder.children.push(next)
      }
      next.files.push(file.index)
      next.size += file.size
      folder = next
    }
    folder.children.push({ kind: 'file', name: parts.at(-1) ?? file.path, file })
  }
  return root.children
}

/** Whether a folder is chosen whole, in part or not at all */
export function folderState(folder: FolderNode, selected: ReadonlySet<number>): 'all' | 'some' | 'none' {
  const chosen = folder.files.filter((index) => selected.has(index)).length
  return chosen === 0 ? 'none' : chosen === folder.files.length ? 'all' : 'some'
}

/** These files in or out of the choice */
export function toggleFiles(selected: ReadonlySet<number>, files: readonly number[], on: boolean): Set<number> {
  const next = new Set(selected)
  for (const index of files) {
    if (on) next.add(index)
    else next.delete(index)
  }
  return next
}

/** Folders shown open at first: all of them for a small torrent, none for a big one (a long series) */
export function initiallyOpen(tree: readonly TreeNode[], fileCount: number): Set<string> {
  const open = new Set<string>()
  if (fileCount > 40) return open
  const walk = (nodes: readonly TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'folder') {
        open.add(node.path)
        walk(node.children)
      }
    }
  }
  walk(tree)
  return open
}
