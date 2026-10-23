import { Button, IconUpload, ScrollArea } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useLibrary } from '../../../entities/library'
import { OpenFileButton } from '../../../features/open-video'
import { navigate } from '../../../shared/lib/router'
import { ContinueGrid } from '../../../widgets/continue-grid'
import { ContinueHero } from '../../../widgets/continue-hero'
import { HistoryList } from '../../../widgets/history-list'
import { Welcome } from './Welcome'

/** Rows of history shown next to the hero; the rest is on the History screen */
const HOME_HISTORY = 30

/**
 * Home (SPEC 3.2): «Продолжить» with the frame of the last stop, history by day next to it,
 * «Не досмотрено» below. Nothing watched yet — the first-run screen.
 */
export function HomePage() {
  const { t } = useTranslation('library')
  const loaded = useLibrary((s) => s.loaded)
  const unfinished = useLibrary((s) => s.continueWatching)
  const history = useLibrary((s) => s.history)

  if (!loaded) return null
  if (!unfinished.length && !history.length) return <Welcome />
  const [hero, ...rest] = unfinished

  return (
    <ScrollArea className="h-full" aria-label={t('history')}>
      <div className="mx-auto flex max-w-[1560px] flex-col gap-[38px] px-8 pt-[26px] pb-12">
        <div className="flex flex-wrap gap-5">
          {hero ? (
            <ContinueHero file={hero} />
          ) : (
            <section className="flex min-h-[392px] flex-[999_1_600px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line-2">
              <IconUpload size={30} className="text-fg-3" />
              <OpenFileButton size="lg" />
            </section>
          )}
          <aside className="flex max-h-[392px] min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-xl border border-line bg-panel px-3.5 pt-5 pb-3">
            <div className="flex items-center justify-between px-1.5">
              <h2 className="font-display text-lg font-semibold tracking-display text-fg">{t('history')}</h2>
              <Button variant="ghost" size="sm" onPress={() => navigate('history')}>
                {t('allHistory')}
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <HistoryList entries={history.slice(0, HOME_HISTORY)} />
            </ScrollArea>
          </aside>
        </div>
        <ContinueGrid files={rest} />
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-line-2 px-5 py-4 text-sm text-fg-3">
          <IconUpload size={20} />
          {t('dropHint')}
        </div>
      </div>
    </ScrollArea>
  )
}
