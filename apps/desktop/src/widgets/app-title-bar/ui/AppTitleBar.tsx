import { IconButton, IconSettings, Logo, TitleBar, TitleBarNav, TitleBarSpacer, WindowControls } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useWindowState } from '../../../entities/app-window'
import { AddFolderButton } from '../../../features/library-folders'
import { OpenFileButton } from '../../../features/open-video'
import { windowIpc } from '../../../shared/ipc/window'
import { navigate, useScreen, type Screen } from '../../../shared/lib/router'

const SECTIONS = ['home', 'series', 'history', 'downloads'] as const satisfies readonly Screen[]
type Section = (typeof SECTIONS)[number]

const isSection = (screen: Screen): screen is Section => (SECTIONS as readonly Screen[]).includes(screen)

const report = (what: string) => (e: unknown) => console.error(`[window] ${what}`, e)

/** Window title bar: logo, sections, "Open", settings and the window buttons on the right */
export function AppTitleBar() {
  const { t } = useTranslation()
  const screen = useScreen()
  const maximized = useWindowState((s) => s.maximized)
  const items = SECTIONS.map((id) => ({ id, label: t(`nav.${id}`) }))

  return (
    <TitleBar
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
      <TitleBarNav
        label={t('nav.label')}
        items={items}
        // a series page belongs to «Сериалы»
        current={screen === 'show' ? 'series' : isSection(screen) ? screen : null}
        onNavigate={navigate}
      />
      <TitleBarSpacer />
      <OpenFileButton />
      <AddFolderButton icon />
      <IconButton label={t('nav.settings')} tooltipPlacement="bottom" isSelected={screen === 'settings'} onPress={() => navigate('settings')}>
        <IconSettings size={19} />
      </IconButton>
    </TitleBar>
  )
}
