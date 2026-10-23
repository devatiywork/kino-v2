import { useState } from 'react'
import {
  Button,
  IconButton,
  IconFileAdd,
  IconFolder,
  IconSettings,
  Logo,
  SearchField,
  Tabs,
  TitleBar,
  TitleBarNav,
  TitleBarSpacer,
  WindowControls,
} from '../../src'
import { Demo } from './Demo'

const SEASONS = [
  { id: 's1', label: 'Сезон 1', count: 8 },
  { id: 's2', label: 'Сезон 2', count: 8 },
]

const NAV = [
  { id: 'home', label: 'Главная' },
  { id: 'series', label: 'Сериалы' },
  { id: 'history', label: 'История' },
  { id: 'downloads', label: 'Загрузки', badge: 2 },
] as const

type Section = (typeof NAV)[number]['id']

export function ShellSection() {
  const [maximized, setMaximized] = useState(false)
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<Section>('home')

  return (
    <>
      <Demo title="Заголовок окна">
        <div className="w-full overflow-hidden rounded-md border border-line-2">
          <TitleBar
            controls={
              <WindowControls isMaximized={maximized} onToggleMaximize={() => setMaximized((v) => !v)} />
            }
          >
            <Logo />
            <TitleBarNav label="Разделы" items={NAV} current={section} onNavigate={setSection} />
            <SearchField
              label="Поиск"
              placeholder="Поиск по истории и папкам"
              shortcut="Ctrl K"
              value={query}
              onChange={setQuery}
              className="ml-2 w-60"
            />
            <TitleBarSpacer />
            <Button variant="primary" icon={<IconFileAdd size={16} />}>
              Открыть
            </Button>
            <IconButton label="Открыть папку" tooltipPlacement="bottom">
              <IconFolder size={19} />
            </IconButton>
            <IconButton label="Настройки" shortcut="Ctrl ," tooltipPlacement="bottom">
              <IconSettings size={19} />
            </IconButton>
          </TitleBar>
        </div>
      </Demo>
      <Demo title="Вкладки">
        <Tabs aria-label="Сезоны" items={SEASONS} defaultSelectedKey="s2" className="w-full">
          {(season) => (
            <p className="text-sm text-fg-2">
              {season.label}: {season.count} серий. Стрелки ←/→ переключают сезоны.
            </p>
          )}
        </Tabs>
      </Demo>
    </>
  )
}
