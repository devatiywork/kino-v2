import { IconUpload, Logo } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { OpenFileButton } from '../../../features/open-video'

/**
 * First run: nothing watched yet —
 * open a file or drop it onto the window.
 */
export function Welcome() {
  const { t } = useTranslation()
  return (
    <div className="grid h-full place-items-center overflow-hidden p-8">
      <div className="flex w-full max-w-[760px] flex-col items-center gap-8 text-center">
        <Logo size="lg" />
        <h1 className="font-display text-2xl leading-tight font-semibold tracking-display text-balance text-fg">
          {t('welcome.title')} <span className="text-fg-3">{t('welcome.titleMuted')}</span>
        </h1>
        <div className="flex w-full flex-col items-center gap-4 rounded-xl border border-dashed border-line-2 px-6 py-9">
          <IconUpload size={30} className="text-fg-3" />
          <span className="text-fg-2">{t('welcome.drop')}</span>
          <OpenFileButton size="lg" label={t('welcome.openFile')} />
        </div>
      </div>
    </div>
  )
}
