import { useState } from 'react'
import {
  Button,
  IconButton,
  IconEpisodes,
  IconFileAdd,
  IconFolder,
  IconFullscreen,
  IconPause,
  IconPin,
  IconPlay,
  IconSettings,
  IconTrash,
} from '../../src'
import { Demo } from './Demo'

export function ButtonsSection() {
  const [playing, setPlaying] = useState(true)
  const [pinned, setPinned] = useState(false)

  return (
    <>
      <Demo title="Варианты">
        <Button variant="primary" icon={<IconFileAdd size={16} />}>
          Открыть
        </Button>
        <Button variant="secondary">Серия 6</Button>
        <Button variant="outline" icon={<IconFolder size={16} />}>
          Добавить папку
        </Button>
        <Button variant="ghost">Вся история</Button>
        <Button variant="danger" icon={<IconTrash size={16} />}>
          Очистить
        </Button>
        <Button variant="primary" isDisabled>
          Недоступно
        </Button>
      </Demo>
      <Demo title="Размеры">
        <Button variant="primary" size="sm">
          Маленькая
        </Button>
        <Button variant="primary" size="md">
          Обычная
        </Button>
        <Button variant="primary" size="lg" icon={<IconPlay size={16} />}>
          Продолжить с 23:14
        </Button>
      </Demo>
      <Demo title="Кнопки-иконки">
        <IconButton label="Настройки">
          <IconSettings />
        </IconButton>
        <IconButton label="Поверх всех окон" isSelected={pinned} onPress={() => setPinned((v) => !v)}>
          <IconPin size={18} />
        </IconButton>
        <div className="flex items-center gap-1 rounded-lg bg-video p-2">
          <IconButton
            label={playing ? 'Пауза' : 'Воспроизвести'}
            variant="solid"
            size="xl"
            onPress={() => setPlaying((v) => !v)}
          >
            {playing ? <IconPause size={22} /> : <IconPlay size={22} />}
          </IconButton>
          <IconButton label="Серии" variant="overlay" size="lg">
            <IconEpisodes />
          </IconButton>
          <IconButton label="Во весь экран" variant="overlay" size="lg">
            <IconFullscreen />
          </IconButton>
        </div>
      </Demo>
    </>
  )
}
