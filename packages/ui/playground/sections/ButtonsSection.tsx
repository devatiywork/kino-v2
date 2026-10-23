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
  Pressable,
} from '../../src'
import { Demo } from './Demo'

export function ButtonsSection() {
  const [playing, setPlaying] = useState(true)
  const [pinned, setPinned] = useState(false)
  const [pressed, setPressed] = useState(0)

  return (
    <>
      <Demo title={`Нажимаемая поверхность: карточки и строки · нажата ${pressed} раз`}>
        <Pressable
          aria-label="Продолжить «Клан Сопрано», серия 5"
          onPress={() => setPressed((n) => n + 1)}
          className="flex w-64 flex-col gap-2 rounded-lg"
        >
          <div className="aspect-video rounded-lg bg-raise transition-[scale] duration-(--duration-fast) group-data-[hovered]:scale-[1.02]" />
          <b className="text-md font-semibold text-fg">Клан Сопрано</b>
          <small className="text-sm text-fg-4">Сезон 1 · Серия 5</small>
        </Pressable>
      </Demo>
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
        {/* Поверх видео всегда тёмная тема — даже когда окно в светлой */}
        <div data-theme="dark" className="flex items-center gap-1 rounded-lg bg-video p-2">
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
