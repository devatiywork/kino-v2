import { useEffect, useState } from 'react'
import { applyTheme, Button, Logo, ScrollArea, SegmentedControl, type ThemeMode } from '../src'
import { ButtonsSection } from './sections/ButtonsSection'
import { IconsSection } from './sections/IconsSection'
import { InputsSection } from './sections/InputsSection'
import { SelectsSection } from './sections/SelectsSection'
import { TokensSection } from './sections/TokensSection'

const SECTIONS = [
  { id: 'tokens', title: 'Токены', render: () => <TokensSection /> },
  { id: 'icons', title: 'Иконки', render: () => <IconsSection /> },
  { id: 'buttons', title: 'Кнопки', render: () => <ButtonsSection /> },
  { id: 'selects', title: 'Списки', render: () => <SelectsSection /> },
  { id: 'inputs', title: 'Управление', render: () => <InputsSection /> },
] as const

const THEMES = [
  { value: 'dark', label: 'Тёмная' },
  { value: 'light', label: 'Светлая' },
  { value: 'system', label: 'Как в системе' },
] as const

export function App() {
  const [active, setActive] = useState<string>(SECTIONS[0].id)
  const [theme, setTheme] = useState<ThemeMode>('dark')

  useEffect(() => applyTheme(theme), [theme])

  const go = (id: string) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-line px-5">
        <Logo />
        <span className="text-sm text-fg-3">UI-библиотека · витрина компонентов</span>
        <div className="flex-1" />
        <SegmentedControl aria-label="Тема" options={THEMES} value={theme} onChange={setTheme} size="sm" />
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Разделы витрины" className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-line p-3">
          {SECTIONS.map((section) => (
            <Button
              key={section.id}
              variant="ghost"
              className={active === section.id ? 'justify-start bg-raise text-fg' : 'justify-start'}
              onPress={() => go(section.id)}
            >
              {section.title}
            </Button>
          ))}
        </nav>
        <ScrollArea className="flex-1" viewportClassName="px-10 py-8" aria-label="Компоненты">
          <div className="mx-auto flex max-w-5xl flex-col gap-14 pb-24">
            {SECTIONS.map((section) => (
              <section key={section.id} id={section.id} className="flex scroll-mt-8 flex-col gap-6">
                <h2 className="font-display text-xl font-semibold">{section.title}</h2>
                {section.render()}
              </section>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
