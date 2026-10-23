/** Containers Kino opens as video (mpv plays far more; this list drives the file picker and drag and drop) */
export const VIDEO_EXTENSIONS = [
  'mkv', 'mp4', 'm4v', 'avi', 'mov', 'webm', 'wmv', 'flv', 'ts', 'm2ts', 'mts', 'mpg', 'mpeg', 'vob', 'ogv', '3gp',
] as const

export function extensionOf(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isVideoPath(path: string): boolean {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extensionOf(path))
}

/** Last path segment, for both \ and / separators */
export function fileName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

/** File name without the extension — a title when mpv has none */
export function baseName(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}
