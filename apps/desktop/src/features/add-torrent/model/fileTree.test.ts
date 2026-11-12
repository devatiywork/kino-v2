import { describe, expect, it } from 'vitest'
import { buildTree, folderState, initiallyOpen, toggleFiles, type FolderNode } from './fileTree'

const files = [
  { index: 0, path: 'Season 1\\E01.mkv', size: 10 },
  { index: 1, path: 'Season 1\\Extras\\Making of.mkv', size: 5 },
  { index: 2, path: 'Season 2\\E01.mkv', size: 20 },
  { index: 3, path: 'readme.txt', size: 1 },
]

describe('fileTree', () => {
  it('папки по пути, в порядке торрента; у папки — все файлы глубже и их размер', () => {
    const tree = buildTree(files)
    expect(tree.map((n) => n.name)).toEqual(['Season 1', 'Season 2', 'readme.txt'])
    const season1 = tree[0] as FolderNode
    expect(season1.files).toEqual([0, 1])
    expect(season1.size).toBe(15)
    expect(season1.children.map((n) => n.name)).toEqual(['E01.mkv', 'Extras'])
    expect((season1.children[1] as FolderNode).path).toBe('Season 1\\Extras')
  })

  it('папка выбрана целиком, частично или нет; галочка папки берёт всё внутри', () => {
    const season1 = buildTree(files)[0] as FolderNode
    expect(folderState(season1, new Set([0, 1]))).toBe('all')
    expect(folderState(season1, new Set([1, 2]))).toBe('some')
    expect(folderState(season1, new Set([2]))).toBe('none')
    expect([...toggleFiles(new Set([2]), season1.files, true)].sort()).toEqual([0, 1, 2])
    expect([...toggleFiles(new Set([0, 1, 2]), season1.files, false)]).toEqual([2])
  })

  it('маленький торрент раскрыт целиком, большой сериал — свёрнут по папкам', () => {
    expect([...initiallyOpen(buildTree(files), files.length)]).toEqual(['Season 1', 'Season 1\\Extras', 'Season 2'])
    expect(initiallyOpen(buildTree(files), 200).size).toBe(0)
  })
})
