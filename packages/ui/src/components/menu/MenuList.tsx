import { Fragment, useRef, type ReactNode } from 'react'
import { mergeProps, useMenu, useMenuItem, type AriaMenuOptions, type Key } from 'react-aria'
import { Item, useTreeState, type Node, type TreeState } from 'react-stately'
import { cn } from '../../lib/cn'
import { dataFlags } from '../../lib/focusRing'

/** Пункт меню: действие с иконкой, сочетанием клавиш и опасным тоном */
export interface MenuItemData {
  id: string
  label: string
  icon?: ReactNode
  shortcut?: string
  tone?: 'default' | 'danger'
  isDisabled?: boolean
  /** Черта-разделитель перед пунктом */
  separatorBefore?: boolean
}

function renderMenuItem(item: MenuItemData) {
  return (
    <Item key={item.id} textValue={item.label}>
      {item.label}
    </Item>
  )
}

export interface MenuListProps<T extends MenuItemData>
  extends Omit<AriaMenuOptions<T>, 'items' | 'children' | 'onAction'> {
  items: ReadonlyArray<T>
  onAction?: (key: Key) => void
  className?: string
}

/** Список действий меню: стрелки, Enter, поиск по первым буквам, закрытие после выбора */
export function MenuList<T extends MenuItemData>({ items, onAction, className, ...props }: MenuListProps<T>) {
  const options = {
    ...props,
    items,
    // react-aria передаёт вторым аргументом сам пункт; наружу отдаём только ключ
    onAction: onAction ? (key: Key) => onAction(key) : undefined,
    children: renderMenuItem,
    disabledKeys: items.filter((i) => i.isDisabled).map((i) => i.id),
  }
  const state = useTreeState<T>(options)
  const ref = useRef<HTMLUListElement>(null)
  const { menuProps } = useMenu(options, state, ref)

  return (
    <ul {...menuProps} ref={ref} className={cn('flex min-w-52 flex-col gap-0.5 p-1 outline-none', className)}>
      {[...state.collection].map((node) => (
        <Fragment key={node.key}>
          {node.value?.separatorBefore ? <li role="separator" className="mx-2 my-1 h-px bg-line-2" /> : null}
          <MenuRow node={node} state={state} />
        </Fragment>
      ))}
    </ul>
  )
}

function MenuRow<T extends MenuItemData>({ node, state }: { node: Node<T>; state: TreeState<T> }) {
  const ref = useRef<HTMLLIElement>(null)
  const { menuItemProps, labelProps, keyboardShortcutProps, isFocused, isDisabled } = useMenuItem({ key: node.key }, state, ref)
  const item = node.value
  const danger = item?.tone === 'danger'

  return (
    <li
      {...mergeProps(menuItemProps)}
      ref={ref}
      {...dataFlags({ focused: isFocused, disabled: isDisabled })}
      className={cn(
        'flex min-h-9 items-center gap-2.5 rounded-md px-2 text-base outline-none transition-colors duration-(--duration-fast)',
        'data-[disabled]:opacity-40',
        danger ? 'text-danger data-[focused]:bg-danger/12' : 'text-fg data-[focused]:bg-hover-2',
      )}
    >
      <span className={cn('grid size-[18px] shrink-0 place-items-center', danger ? 'text-danger' : 'text-fg-2')}>
        {item?.icon}
      </span>
      <span {...labelProps} className="flex-1 truncate">
        {node.rendered}
      </span>
      {item?.shortcut ? (
        <kbd {...keyboardShortcutProps} className="font-mono text-2xs text-fg-3">
          {item.shortcut}
        </kbd>
      ) : null}
    </li>
  )
}
