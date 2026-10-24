import { useState } from 'react'
import {
  Button,
  IconArchive,
  IconButton,
  IconEpisodes,
  IconFileAdd,
  IconFolder,
  IconPlay,
  IconSettings,
  Logo,
  SearchCombo,
  SearchField,
  Tabs,
  TitleBar,
  TitleBarNav,
  TitleBarSpacer,
  WindowControls,
  type SearchComboSection,
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

const FOUND: SearchComboSection[] = [
  { id: 'series', title: 'Сериалы', items: [{ id: 's:shogun', label: 'Сёгун', description: 'Сезон 1 · 6 из 10', icon: <IconEpisodes size={18} /> }] },
  {
    id: 'history',
    title: 'История',
    items: [
      { id: 'f:2', label: 'Сёгун · Серия 7', description: 'остановились на 23:14', icon: <IconPlay size={16} /> },
      { id: 'f:1', label: 'Сёгун · Серия 6', description: 'досмотрено', icon: <IconPlay size={16} /> },
    ],
  },
  { id: 'archive', title: 'Архив торрентов', items: [{ id: 't:9', label: 'Shogun.S01.2160p', description: 'Сериалы · 54,2 ГБ', meta: 'файлы удалены', icon: <IconArchive size={16} /> }] },
]

/** Поиск заголовка с выпадающим найденным: «сёг» находит всё, другое — «ничего не найдено» */
function SearchComboDemo() {
  const [query, setQuery] = useState('')
  const [opened, setOpened] = useState<string | null>(null)
  const sections = query.trim() && 'сёгун shogun'.includes(query.trim().toLowerCase()) ? FOUND : []
  return (
    <div className="flex w-full flex-col gap-3">
      <SearchCombo
        label="Поиск"
        placeholder="Поиск по истории, сериалам и архиву"
        shortcut="Ctrl K"
        value={query}
        onChange={setQuery}
        sections={sections}
        onAction={(id) => {
          setOpened(id)
          setQuery('')
        }}
        emptyText={`Ничего не найдено по запросу «${query.trim()}»`}
        className="w-80"
      />
      <p className="text-sm text-fg-3">Наберите «сёг» или «shog». Открыто: {opened ?? '—'}</p>
    </div>
  )
}

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
      <Demo title="Поиск с найденным (Ctrl K в заголовке)">
        <SearchComboDemo />
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
