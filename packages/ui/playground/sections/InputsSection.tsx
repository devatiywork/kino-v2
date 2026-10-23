import { useState } from 'react'
import { Kbd, Logo, SegmentedControl, Slider, Switch } from '../../src'
import { Demo } from './Demo'

const INTRO = [
  { value: 'ask', label: 'Кнопка' },
  { value: 'auto', label: 'Пропускать' },
  { value: 'off', label: 'Не трогать' },
] as const

const SIZES = [
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
] as const

export function InputsSection() {
  const [intro, setIntro] = useState<string>('ask')
  const [volume, setVolume] = useState(80)

  return (
    <>
      <Demo title="Переключатели">
        <Switch defaultSelected>Автовоспроизведение</Switch>
        <Switch>Ночной режим звука</Switch>
        <Switch isDisabled>Недоступно</Switch>
      </Demo>
      <Demo title={`Сегменты · выбрано: ${intro}`}>
        <SegmentedControl aria-label="Заставка" options={INTRO} value={intro} onChange={setIntro} />
        <SegmentedControl aria-label="Размер субтитров" options={SIZES} defaultValue="M" size="sm" />
      </Demo>
      <Demo title={`Слайдер · ${volume}%`}>
        <div className="w-80">
          <Slider
            label="Громкость"
            value={volume}
            onChange={setVolume}
            maxValue={130}
            step={5}
            showValue
          />
        </div>
        <div className="w-80">
          <Slider label="Громкость по умолчанию" showLabel defaultValue={60} isDisabled />
        </div>
      </Demo>
      <Demo title="Клавиши">
        <Kbd>Пробел</Kbd>
        <Kbd>← →</Kbd>
        <Kbd>Ctrl K</Kbd>
        <Kbd>F</Kbd>
      </Demo>
      <Demo title="Логотип">
        <Logo size="sm" />
        <Logo size="md" />
        <Logo size="lg" />
      </Demo>
    </>
  )
}
