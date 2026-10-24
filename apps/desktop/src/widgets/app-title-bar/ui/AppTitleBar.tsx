import { IconButton, IconSettings, Logo, TitleBar, TitleBarNav, WindowControls } from '@kino/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useWindowState } from '../../../entities/app-window'
import { downloadingCount, useTorrents } from '../../../entities/torrent'
import { AddFolderButton } from '../../../features/library-folders'
import { OpenFileButton } from '../../../features/open-video'
import { windowIpc } from '../../../shared/ipc/window'
import { navigate, useScreen, type Screen } from '../../../shared/lib/router'
import { DownloadSpeed } from './DownloadSpeed'

const SECTIONS = ['home', 'library', 'history', 'downloads'] as const satisfies readonly Screen[]
type Section = (typeof SECTIONS)[number]

const isSection = (screen: Screen): screen is Section => (SECTIONS as readonly Screen[]).includes(screen)

const report = (what: string) => (e: unknown) => console.error(`[window] ${what}`, e)

/**
 * Window title bar: logo and sections on the left (the number of downloads on «Загрузки», the
 * download speed after them), the search in the middle of the window (`search` — the app puts it
 * there), "Open", settings and the window buttons on the right.
 * A narrow window (down to the smallest, 960 px): the search narrows, then «Открыть» keeps only its
 * icon (below 1200 px), then the speed goes (below 1100 px) — the window buttons stay in the window
 */
export function AppTitleBar({ search }: { search?: ReactNode }) {
  const { t } = useTranslation()
  const screen = useScreen()
  const maximized = useWindowState((s) => s.maximized)
  const downloading = useTorrents((s) => downloadingCount(s.active))
  const items = SECTIONS.map((id) => ({ id, label: t(`nav.${id}`), badge: id === 'downloads' ? downloading : undefined }))

  return (
    <TitleBar
      center={search}
      end={
        <>
          <OpenFileButton narrow />
          <AddFolderButton icon />
          <IconButton label={t('nav.settings')} tooltipPlacement="bottom" isSelected={screen === 'settings'} onPress={() => navigate('settings')}>
            <IconSettings size={19} />
          </IconButton>
        </>
      }
      controls={
        <WindowControls
          isMaximized={maximized}
          onMinimize={() => void windowIpc.minimize().catch(report('minimize'))}
          onToggleMaximize={() => void windowIpc.toggleMaximize().catch(report('maximize'))}
          onClose={() => void windowIpc.close().catch(report('close'))}
        />
      }
    >
      <Logo />
      {/* bun run dev: not to be taken for the installed Kino */}
      {import.meta.env.DEV ? (
        <span data-dev-badge className="-ml-1 rounded-sm border border-line-2 px-1 font-mono text-2xs text-fg-3 uppercase max-[1000px]:hidden">
          dev
        </span>
      ) : null}
      <TitleBarNav
        label={t('nav.label')}
        items={items}
        // a series page belongs to «Библиотека»
        current={screen === 'show' ? 'library' : isSection(screen) ? screen : null}
        onNavigate={navigate}
      />
      <DownloadSpeed />
    </TitleBar>
  )
}
