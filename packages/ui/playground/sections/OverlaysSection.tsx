import { useState } from 'react'
import {
  Button,
  ConfirmDialog,
  ContextMenu,
  IconButton,
  IconClock,
  IconFolder,
  IconFullscreen,
  IconMore,
  IconPin,
  IconPlay,
  IconSubtitles,
  IconTrash,
  ListBox,
  MenuButton,
  PopoverButton,
  useToast,
} from '../../src'
import { Demo } from './Demo'

const EPISODE_ACTIONS = [
  { id: 'play', label: 'Смотреть с начала', icon: <IconPlay size={16} /> },
  { id: 'folder', label: 'Открыть папку', icon: <IconFolder size={16} />, shortcut: 'Ctrl E' },
  { id: 'later', label: 'Отметить просмотренной', icon: <IconClock size={16} />, isDisabled: true },
  { id: 'remove', label: 'Убрать из истории', icon: <IconTrash size={16} />, tone: 'danger' as const, separatorBefore: true },
]

const DUBS = [
  { id: 'goblin', label: 'AVO Goblin', description: 'RU · AC3 5.1' },
  { id: 'novamedia', label: 'MVO Novamedia', description: 'RU · AC3 5.1' },
  { id: 'english', label: 'English', description: 'EN · AC3 5.1' },
]

export function OverlaysSection() {
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lastAction, setLastAction] = useState('—')
  const [dub, setDub] = useState('goblin')

  return (
    <>
      <Demo title="Подсказки: наведите и подождите или перейдите по Tab">
        <IconButton label="Поверх всех окон" tooltip="Окно останется над другими программами">
          <IconPin size={18} />
        </IconButton>
        <IconButton label="Во весь экран" shortcut="F">
          <IconFullscreen />
        </IconButton>
      </Demo>
      <Demo title={`Меню · последнее действие: ${lastAction}`}>
        <MenuButton label="Ещё" icon={<IconMore />} items={EPISODE_ACTIONS} onAction={(key) => setLastAction(String(key))} />
        <MenuButton label="Сортировка" variant="outline" items={EPISODE_ACTIONS} placement="bottom start">
          Действия с серией
        </MenuButton>
        <ContextMenu
          label="Действия с серией"
          items={EPISODE_ACTIONS}
          onAction={(key) => setLastAction(String(key))}
          className="flex h-20 min-w-72 flex-1 items-center justify-center rounded-md border border-dashed border-line-2 text-sm text-fg-3"
        >
          Правый клик здесь — своё контекстное меню
        </ContextMenu>
      </Demo>
      <Demo title={`Кнопка со всплывающим окном · озвучка: ${dub}`}>
        <PopoverButton
          label="Озвучка и субтитры"
          icon={<IconSubtitles />}
          placement="bottom start"
          popoverClassName="w-72 p-2"
          content={(close) => (
            <ListBox
              aria-label="Озвучка"
              items={DUBS}
              selectedKey={dub}
              onSelectionChange={(key) => {
                setDub(String(key))
                close()
              }}
            />
          )}
        />
        <PopoverButton label="Скорость" variant="outline" placement="bottom start" content={<p className="p-3 text-sm text-fg-2">Любое содержимое</p>}>
          1.0×
        </PopoverButton>
      </Demo>
      <Demo title="Подтверждение вместо window.confirm">
        <Button variant="danger" icon={<IconTrash size={16} />} onPress={() => setConfirmOpen(true)}>
          Очистить историю
        </Button>
        <ConfirmDialog
          isOpen={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Очистить историю?"
          description="Позиции просмотра и запомненные дорожки для всех сериалов удалятся. Файлы на диске останутся."
          confirmLabel="Очистить"
          tone="danger"
          onConfirm={() => toast.show({ title: 'История очищена', action: { label: 'Вернуть', onPress: () => undefined } })}
        />
      </Demo>
      <Demo title="Уведомления">
        <Button onPress={() => toast.show({ title: 'Дорожка «Русский» не найдена', description: 'Выбрана: English' })}>
          Обычное
        </Button>
        <Button onPress={() => toast.show({ title: 'Kino связан с .mkv, .mp4, .avi', tone: 'success' })}>Успех</Button>
        <Button onPress={() => toast.show({ title: 'Файл не поддерживается', description: 'sample.xyz', tone: 'danger' })}>
          Ошибка
        </Button>
      </Demo>
    </>
  )
}
