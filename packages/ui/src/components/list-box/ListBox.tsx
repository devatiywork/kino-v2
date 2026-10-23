import { useRef } from 'react'
import { mergeProps, useListBox, useOption, type AriaListBoxOptions, type Key } from 'react-aria'
import { useListState, type ListState, type Node } from 'react-stately'
import { IconCheck } from '../../icons'
import { dataFlags } from '../../lib/focusRing'
import { tv } from '../../lib/tv'
import { ScrollArea } from '../scroll-area/ScrollArea'
import { renderListItem, type ListItem } from './listItem'

const listBoxStyles = tv({
  slots: {
    list: 'flex flex-col gap-0.5 p-1 outline-none',
    option: [
      'flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1.5 text-base text-fg outline-none',
      'transition-colors duration-(--duration-fast)',
      'data-[focused]:bg-hover-2 data-[disabled]:opacity-40',
    ],
    check: 'shrink-0 text-accent opacity-0 group-data-[selected]/option:opacity-100',
    text: 'flex min-w-0 flex-1 flex-col',
    label: 'truncate group-data-[selected]/option:font-semibold group-data-[selected]/option:text-accent-fg',
    description: 'truncate font-mono text-2xs text-fg-3',
  },
})

interface ListBoxBaseProps<T extends ListItem> extends AriaListBoxOptions<T> {
  state: ListState<T>
  /** Максимальная высота списка, дальше — прокрутка */
  maxHeight?: number
  className?: string
}

/** Список с выбором стрелками, Enter и поиском по первым буквам. Основа Select и меню */
export function ListBoxBase<T extends ListItem>({ state, maxHeight = 288, className, ...props }: ListBoxBaseProps<T>) {
  const ref = useRef<HTMLUListElement>(null)
  const { listBoxProps } = useListBox(props, state, ref)
  const s = listBoxStyles()

  return (
    <ScrollArea viewportStyle={{ maxHeight }} className={className}>
      <ul {...listBoxProps} ref={ref} className={s.list()}>
        {[...state.collection].map((node) => (
          <Option key={node.key} node={node} state={state} />
        ))}
      </ul>
    </ScrollArea>
  )
}

function Option<T extends ListItem>({ node, state }: { node: Node<T>; state: ListState<T> }) {
  const ref = useRef<HTMLLIElement>(null)
  const { optionProps, isSelected, isFocused, isDisabled } = useOption({ key: node.key }, state, ref)
  const s = listBoxStyles()
  const item = node.value

  return (
    <li
      {...mergeProps(optionProps)}
      ref={ref}
      {...dataFlags({ selected: isSelected, focused: isFocused, disabled: isDisabled })}
      className={`group/option ${s.option()}`}
    >
      <IconCheck size={18} className={s.check()} />
      <span className={s.text()}>
        <span className={s.label()}>{node.rendered}</span>
        {item?.description ? <span className={s.description()}>{item.description}</span> : null}
      </span>
      {item?.badge ? (
        <span className="shrink-0 rounded-xs border border-line-2 px-1.5 font-mono text-2xs text-fg-2">{item.badge}</span>
      ) : null}
    </li>
  )
}

export interface ListBoxProps<T extends ListItem>
  extends Omit<AriaListBoxOptions<T>, 'items' | 'onSelectionChange' | 'selectedKeys' | 'defaultSelectedKeys'> {
  items: Iterable<T>
  selectedKey?: Key | null
  defaultSelectedKey?: Key
  onSelectionChange?: (key: Key) => void
  maxHeight?: number
  className?: string
}

/** Самостоятельный список с одиночным выбором — например, озвучки в плеере */
export function ListBox<T extends ListItem>({ items, selectedKey, defaultSelectedKey, onSelectionChange, ...props }: ListBoxProps<T>) {
  const state = useListState<T>({
    items,
    children: renderListItem,
    selectionMode: 'single',
    disallowEmptySelection: true,
    selectedKeys: selectedKey != null ? [selectedKey] : undefined,
    defaultSelectedKeys: defaultSelectedKey != null ? [defaultSelectedKey] : undefined,
    disabledKeys: [...items].filter((i) => i.isDisabled).map((i) => i.id),
    onSelectionChange: (keys) => {
      if (keys === 'all') return
      const [first] = keys
      if (first != null) onSelectionChange?.(first)
    },
  })
  return <ListBoxBase {...props} state={state} />
}
