import { useRef } from 'react'
import { mergeProps, useButton, useFocusRing, useHover, useSelect, type AriaSelectProps, type Key } from 'react-aria'
import { useSelectState } from 'react-stately'
import { IconChevronDown } from '../../icons'
import { dataFlags, focusRing } from '../../lib/focusRing'
import { tv, type VariantProps } from '../../lib/tv'
import { usePresence } from '../../lib/usePresence'
import { ListBoxBase } from '../list-box/ListBox'
import { renderListItem, type ListItem } from '../list-box/listItem'
import { Popover } from '../popover/Popover'

const selectStyles = tv({
  slots: {
    root: 'inline-flex flex-col gap-1.5',
    label: 'text-sm text-fg-2',
    trigger: [
      'group/trigger inline-flex items-center justify-between gap-3 text-left text-fg',
      'transition-[background-color,border-color] duration-(--duration-fast)',
      'data-[disabled]:opacity-40',
      focusRing,
    ],
    value: 'truncate',
    placeholder: 'truncate text-fg-3',
    chevron: 'shrink-0 text-fg-3 transition-[rotate] duration-(--duration-base) ease-out group-data-[open]/trigger:rotate-180',
  },
  variants: {
    variant: {
      /** Поле в настройках */
      field: {
        trigger:
          'rounded-md border border-line-2 bg-panel data-[hovered]:border-fg-3 data-[open]:border-accent',
      },
      /** Без рамки: в панелях и поверх видео */
      ghost: { trigger: 'rounded-md data-[hovered]:bg-hover data-[open]:bg-hover-2' },
    },
    size: {
      sm: { trigger: 'h-8 px-2.5 text-sm' },
      md: { trigger: 'h-[34px] px-3 text-base' },
    },
  },
  defaultVariants: { variant: 'field', size: 'md' },
})

export interface SelectProps<T extends ListItem>
  extends Omit<AriaSelectProps<T>, 'children' | 'items' | 'selectedKey' | 'defaultSelectedKey' | 'onSelectionChange'>,
    VariantProps<typeof selectStyles> {
  items: ReadonlyArray<T>
  selectedKey?: Key | null
  defaultSelectedKey?: Key
  onSelectionChange?: (key: Key) => void
  /** Показывать подпись над полем. Без неё подпись читает только скринридер */
  showLabel?: boolean
  maxListHeight?: number
  className?: string
}

/** Выпадающий список: своя кнопка и своё всплывающее окно, без системного <select> */
export function Select<T extends ListItem>({
  items,
  variant,
  size,
  showLabel = false,
  maxListHeight,
  className,
  onSelectionChange,
  ...props
}: SelectProps<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const state = useSelectState<T>({
    ...props,
    items,
    children: renderListItem,
    disabledKeys: items.filter((i) => i.isDisabled).map((i) => i.id),
    onSelectionChange: (key) => {
      if (key != null) onSelectionChange?.(key)
    },
  })
  const { labelProps, triggerProps, valueProps, menuProps } = useSelect({ ...props, items }, state, triggerRef)
  const { buttonProps } = useButton(triggerProps, triggerRef)
  const { hoverProps, isHovered } = useHover({ isDisabled: props.isDisabled })
  const { focusProps, isFocusVisible } = useFocusRing()
  const presence = usePresence(state.isOpen, 150)
  const s = selectStyles({ variant, size })

  return (
    <div className={s.root({ className })}>
      <span {...labelProps} className={showLabel ? s.label() : 'sr-only'}>
        {props.label}
      </span>
      <button
        ref={triggerRef}
        {...mergeProps(buttonProps, hoverProps, focusProps)}
        {...dataFlags({ open: state.isOpen, hovered: isHovered, 'focus-visible': isFocusVisible, disabled: props.isDisabled })}
        className={s.trigger()}
      >
        <span {...valueProps} className={state.selectedItem ? s.value() : s.placeholder()}>
          {state.selectedItem ? state.selectedItem.rendered : (props.placeholder ?? 'Выберите')}
        </span>
        <IconChevronDown size={16} className={s.chevron()} />
      </button>
      {presence.isMounted ? (
        <Popover state={state} triggerRef={triggerRef} isExiting={presence.isExiting} matchTriggerWidth placement="bottom start">
          <ListBoxBase {...menuProps} state={state} maxHeight={maxListHeight} />
        </Popover>
      ) : null}
    </div>
  )
}
