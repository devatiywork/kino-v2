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
  TitleBarSpacer,
  WindowControls,
} from '../../src'
import { Demo } from './Demo'

const SEASONS = [
  { id: 's1', label: 'Сезон 1', count: 8 },
  { id: 's2', label: 'Сезон 2', count: 8 },
]

export function ShellSection() {
  const [maximized, setMaximized] = useState(false)
  const [query, setQuery] = useState('')

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
            <SearchField
              label="Поиск"
              placeholder="Поиск по истории и папкам"
              shortcut="Ctrl K"
              value={query}
              onChange={setQuery}
              className="ml-2 w-72"
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
