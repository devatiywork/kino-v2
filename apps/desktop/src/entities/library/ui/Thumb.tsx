import { cn, IconPlay } from '@kino/ui'
import { useState, type ReactNode } from 'react'
import { thumbSrc, type LibraryFile } from '../../../shared/ipc/library'

/** Frame of the last stop; without one — a quiet placeholder */
export function Thumb({ file, className, children }: { file: LibraryFile; className?: string; children?: ReactNode }) {
  const src = thumbSrc(file)
  const [broken, setBroken] = useState(false)
  return (
    <div className={cn('relative overflow-hidden bg-raise', className)}>
      {src && !broken ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className={cn('absolute inset-0 size-full object-cover transition-[scale] duration-(--duration-slow) group-data-[hovered]:scale-[1.04]', !file.exists && 'grayscale')}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-fg-4">
          <IconPlay size={22} />
        </div>
      )}
      {children}
    </div>
  )
}
