import { useTranslation } from 'react-i18next'
import { ContinueCard } from '../../../entities/library'
import { useOpenVideo } from '../../../features/open-video'
import type { LibraryFile } from '../../../shared/ipc/library'

/** «Не досмотрено»: cards with the frame of the stop and the time left */
export function ContinueGrid({ files }: { files: LibraryFile[] }) {
  const { t } = useTranslation('library')
  const { openFile } = useOpenVideo()
  if (!files.length) return null
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-xl font-semibold tracking-display text-fg">{t('unfinished')}</h2>
        <span className="font-mono text-xs text-fg-3">{files.length}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-[18px]">
        {files.map((file) => (
          <ContinueCard key={file.id} file={file} onOpen={(f) => void openFile(f)} />
        ))}
      </div>
    </section>
  )
}
