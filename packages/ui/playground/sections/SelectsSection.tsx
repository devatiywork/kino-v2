import { useState } from 'react'
import type { Key } from 'react-aria'
import { ListBox, popoverStyles, Select } from '../../src'
import { Demo } from './Demo'

const LANGUAGES = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
]

const SPEEDS = [
  { id: '0.5', label: '0.5×' },
  { id: '0.75', label: '0.75×' },
  { id: '1', label: '1.0×' },
  { id: '1.25', label: '1.25×' },
  { id: '1.5', label: '1.5×' },
  { id: '2', label: '2.0×' },
]

const AUDIO = [
  { id: 'lostfilm', label: 'LostFilm', description: 'RU · AC3 5.1' },
  { id: 'hdrezka', label: 'HDrezka Studio', description: 'RU · AAC 2.0' },
  { id: 'redhead', label: 'Red Head Sound', description: 'RU · AC3 5.1', badge: 'внешняя .mka' },
  { id: 'original', label: 'Оригинал', description: 'EN · E-AC3 5.1 Atmos' },
  { id: 'commentary', label: 'Комментарии режиссёра', description: 'EN · AAC 2.0', isDisabled: true },
]

const SUBTITLES = [
  { id: 'off', label: 'Выключены' },
  { id: 'ru-full', label: 'Русские, полные', description: 'RU · ASS', badge: 'внешние' },
  { id: 'ru-forced', label: 'Русские, форсированные', description: 'RU · ASS', badge: 'внешние' },
  { id: 'en-sdh', label: 'English SDH', description: 'EN · SRT', badge: 'в файле' },
]

export function SelectsSection() {
  const [audio, setAudio] = useState<Key>('lostfilm')
  const [speed, setSpeed] = useState<Key>('1')

  return (
    <>
      <Demo title="Выпадающие списки">
        <Select label="Язык интерфейса" showLabel items={LANGUAGES} defaultSelectedKey="ru" className="w-56" />
        <Select
          label="Скорость по умолчанию"
          showLabel
          items={SPEEDS}
          selectedKey={speed}
          onSelectionChange={setSpeed}
          className="w-56"
        />
        <Select label="Озвучка" showLabel items={AUDIO} selectedKey={audio} onSelectionChange={setAudio} className="w-64" />
        <Select label="Скорость" items={SPEEDS} defaultSelectedKey="1" variant="ghost" size="sm" />
        <Select label="Недоступно" showLabel items={LANGUAGES} defaultSelectedKey="ru" isDisabled className="w-40" />
      </Demo>
      <Demo title="Раскрытое состояние: так выглядит открытый список">
        <div className="flex flex-wrap items-start gap-6">
          <div className={popoverStyles({ className: 'w-72 animate-none' })}>
            <ListBox aria-label="Озвучка" items={AUDIO} selectedKey={audio} onSelectionChange={setAudio} />
          </div>
          <div className={popoverStyles({ className: 'w-72 animate-none' })}>
            <ListBox aria-label="Субтитры" items={SUBTITLES} defaultSelectedKey="ru-full" />
          </div>
          <div className={popoverStyles({ className: 'w-36 animate-none' })}>
            <ListBox aria-label="Скорость" items={SPEEDS} selectedKey={speed} onSelectionChange={setSpeed} maxHeight={160} />
          </div>
        </div>
      </Demo>
    </>
  )
}
