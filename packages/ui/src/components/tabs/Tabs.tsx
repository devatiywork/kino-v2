import { useRef, type ReactNode } from 'react'
import { mergeProps, useFocusRing, useHover, useTab, useTabList, useTabPanel, type AriaTabListProps, type Key } from 'react-aria'
import { Item, useTabListState, type Node, type TabListState } from 'react-stately'
import { dataFlags, focusRing } from '../../lib/focusRing'
import { cn } from '../../lib/cn'

export interface TabItem {
  id: string
  label: string
  /** Число справа от подписи: количество серий в сезоне */
  count?: number
  isDisabled?: boolean
}

export interface TabsProps<T extends TabItem>
  extends Omit<AriaTabListProps<T>, 'children' | 'items' | 'selectedKey' | 'defaultSelectedKey' | 'onSelectionChange'> {
  items: ReadonlyArray<T>
  /** Содержимое панели выбранной вкладки */
  children: (item: T) => ReactNode
  selectedKey?: Key
  defaultSelectedKey?: Key
  onSelectionChange?: (key: Key) => void
  className?: string
}

/** Вкладки: стрелки ←/→ переключают, Home/End — к краям. Например, сезоны сериала */
export function Tabs<T extends TabItem>({ items, children, className, onSelectionChange, ...props }: TabsProps<T>) {
  const collection = {
    ...props,
    items,
    disabledKeys: items.filter((i) => i.isDisabled).map((i) => i.id),
    onSelectionChange: (key: Key | null) => {
      if (key != null) onSelectionChange?.(key)
    },
    children: (item: T) => (
      <Item key={item.id} title={item.label} textValue={item.label}>
        {children(item)}
      </Item>
    ),
  }
  const state = useTabListState<T>(collection)
  const ref = useRef<HTMLDivElement>(null)
  const { tabListProps } = useTabList(collection, state, ref)

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div {...tabListProps} ref={ref} className="inline-flex gap-1 self-start rounded-md border border-line bg-panel p-[3px]">
        {[...state.collection].map((node) => (
          <Tab key={node.key} node={node} state={state} />
        ))}
      </div>
      <TabPanel state={state} />
    </div>
  )
}

function Tab<T extends TabItem>({ node, state }: { node: Node<T>; state: TabListState<T> }) {
  const ref = useRef<HTMLDivElement>(null)
  const { tabProps, isSelected, isDisabled, isPressed } = useTab({ key: node.key }, state, ref)
  const { focusProps, isFocusVisible } = useFocusRing()
  const { hoverProps, isHovered } = useHover({ isDisabled })

  return (
    <div
      {...mergeProps(tabProps, focusProps, hoverProps)}
      ref={ref}
      {...dataFlags({ selected: isSelected, disabled: isDisabled, pressed: isPressed, hovered: isHovered, 'focus-visible': isFocusVisible })}
      className={cn(
        'flex h-[30px] items-center gap-2 rounded-[7px] px-3 text-sm whitespace-nowrap text-fg-2',
        'transition-[background-color,color] duration-(--duration-fast)',
        'data-[hovered]:text-fg data-[selected]:bg-raise-2 data-[selected]:font-semibold data-[selected]:text-fg data-[disabled]:opacity-40',
        focusRing,
      )}
    >
      {node.rendered}
      {node.value?.count !== undefined ? <span className="font-mono text-2xs text-fg-3">{node.value.count}</span> : null}
    </div>
  )
}

function TabPanel<T extends TabItem>({ state }: { state: TabListState<T> }) {
  const ref = useRef<HTMLDivElement>(null)
  const { tabPanelProps } = useTabPanel({}, state, ref)
  return (
    <div {...tabPanelProps} ref={ref} className="outline-none">
      {state.selectedItem?.props.children}
    </div>
  )
}
