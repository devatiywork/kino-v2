import { useRef, type ReactNode } from 'react'
import { mergeProps, useButton, useHover } from 'react-aria'
import { IconWindowClose, IconWindowMaximize, IconWindowMinimize, IconWindowRestore } from '../../icons'
import { cn } from '../../lib/cn'
import { dataFlags } from '../../lib/focusRing'

interface CaptionButtonProps {
  label: string
  onPress?: () => void
  isClose?: boolean
  children: ReactNode
}

/** Кнопка окна как в Windows 11: 46 px шириной, на всю высоту заголовка, вне порядка Tab */
function CaptionButton({ label, onPress, isClose, children }: CaptionButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const { buttonProps, isPressed } = useButton({ onPress, excludeFromTabOrder: true, 'aria-label': label }, ref)
  const { hoverProps, isHovered } = useHover({})

  return (
    <button
      ref={ref}
      {...mergeProps(buttonProps, hoverProps)}
      {...dataFlags({ hovered: isHovered, pressed: isPressed })}
      className={cn(
        'grid w-[46px] place-items-center self-stretch text-fg-2 transition-colors duration-(--duration-fast)',
        isClose
          ? 'data-[hovered]:bg-win-close data-[hovered]:text-win-close-fg data-[pressed]:bg-win-close/85'
          : 'data-[hovered]:bg-hover-2 data-[hovered]:text-fg data-[pressed]:bg-hover',
      )}
    >
      {children}
    </button>
  )
}

export interface WindowControlsProps {
  isMaximized?: boolean
  onMinimize?: () => void
  onToggleMaximize?: () => void
  onClose?: () => void
  className?: string
}

/** Свернуть, развернуть/восстановить, закрыть — справа, как принято в Windows */
export function WindowControls({ isMaximized, onMinimize, onToggleMaximize, onClose, className }: WindowControlsProps) {
  return (
    <div className={cn('flex self-stretch', className)}>
      <CaptionButton label="Свернуть" onPress={onMinimize}>
        <IconWindowMinimize size={15} />
      </CaptionButton>
      <CaptionButton label={isMaximized ? 'Восстановить' : 'Развернуть'} onPress={onToggleMaximize}>
        {isMaximized ? <IconWindowRestore size={14} /> : <IconWindowMaximize size={14} />}
      </CaptionButton>
      <CaptionButton label="Закрыть" onPress={onClose} isClose>
        <IconWindowClose size={15} />
      </CaptionButton>
    </div>
  )
}
