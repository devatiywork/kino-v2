import { useState } from 'react'
import { Button, Checkbox, Kbd, KeyRecorder, Logo, SegmentedControl, Slider, Switch, SwatchPicker, TextField } from '../../src'
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
  const [pauseKey, setPauseKey] = useState('Space')

  return (
    <>
      <Demo title="Флажки">
        <Checkbox defaultSelected>Peacemaker.S02E01.mkv</Checkbox>
        <Checkbox>Peacemaker.S02E02.mkv</Checkbox>
        <Checkbox isIndeterminate aria-label="Все файлы">
          Файлы
        </Checkbox>
        <Checkbox isDisabled>Недоступно</Checkbox>
      </Demo>
      <Demo title="Текстовые поля">
        <div className="grid w-full grid-cols-2 gap-4">
          <TextField label="Название" defaultValue="Peacemaker.S02.2160p" />
          <TextField label="Страница раздачи" placeholder="https://…" description="Необязательно, но через год пригодится" mono />
          <TextField
            label="Папка"
            defaultValue={'D:\\Сериалы'}
            mono
            addon={
              <Button variant="ghost" size="sm">
                Обзор…
              </Button>
            }
          />
          <TextField label="Magnet-ссылка" defaultValue="magnet:?xt=urn:btih:abc" mono isInvalid errorMessage="В ссылке нет хеша раздачи" />
        </div>
      </Demo>
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
      <Demo title={`Переназначение клавиши · code: ${pauseKey}`}>
        <KeyRecorder aria-label={`Пауза — ${pauseKey}`} listeningLabel="Нажмите клавишу" onRecord={(key) => setPauseKey(key.code)}>
          {pauseKey === 'Space' ? 'Пробел' : pauseKey}
        </KeyRecorder>
        <KeyRecorder aria-label="Недоступно" listeningLabel="" onRecord={() => undefined} isDisabled>
          F
        </KeyRecorder>
      </Demo>
      <Demo title="Образцы цвета">
        <SwatchPicker
          aria-label="Акцент для примера"
          defaultValue="teal"
          options={[
            { value: 'ember', label: 'Оранжевый', color: 'var(--kino-accent-ember)' },
            { value: 'teal', label: 'Бирюзовый', color: 'var(--kino-accent-teal)' },
            { value: 'violet', label: 'Сиреневый', color: 'var(--kino-accent-violet)' },
          ]}
        />
      </Demo>
      <Demo title="Логотип">
        <Logo size="sm" />
        <Logo size="md" />
        <Logo size="lg" />
      </Demo>
    </>
  )
}
