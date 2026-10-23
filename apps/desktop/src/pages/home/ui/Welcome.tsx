import { IconClock, IconLayers, IconSubtitles, IconUpload, Logo } from '@kino/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OpenFileButton } from '../../../features/open-video'

function Tip({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel p-4 text-sm text-fg-2">
      <span className="text-accent">{icon}</span>
      <b className="text-base font-semibold text-fg">{title}</b>
      {children}
    </div>
  )
}

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
        <div className="grid w-full grid-cols-3 gap-3 text-left">
          <Tip icon={<IconLayers size={20} />} title={t('welcome.tips.seasons.title')}>
            {t('welcome.tips.seasons.text')}
          </Tip>
          <Tip icon={<IconSubtitles size={20} />} title={t('welcome.tips.tracks.title')}>
            {t('welcome.tips.tracks.text')}
          </Tip>
          <Tip icon={<IconClock size={20} />} title={t('welcome.tips.resume.title')}>
            {t('welcome.tips.resume.text')}
          </Tip>
        </div>
      </div>
    </div>
  )
}
