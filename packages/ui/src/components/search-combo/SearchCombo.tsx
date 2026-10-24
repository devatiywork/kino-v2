import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { mergeProps, useButton, useComboBox, useHover, useListBox, useListBoxSection, useOption, type AriaListBoxOptions } from 'react-aria'
import { Item, Section, useComboBoxState, type ComboBoxState, type Node } from 'react-stately'
import { IconClose, IconSearch } from '../../icons'
import { cn } from '../../lib/cn'
import { dataFlags } from '../../lib/focusRing'
import { usePresence } from '../../lib/usePresence'
import { Kbd } from '../kbd/Kbd'
import { Popover } from '../popover/Popover'
import { ScrollArea } from '../scroll-area/ScrollArea'

/** Найденное: подпись, строка пояснения, значок или кадр слева, пометка справа */
export interface SearchComboItem {
  id: string
  label: string
  description?: string
  icon?: ReactNode
  meta?: ReactNode
}

/** Группа найденного: «Сериалы», «История», «Архив» */
export interface SearchComboSection {
  id: string
  title: string
  items: SearchComboItem[]
}

export interface SearchComboProps {
  /** Подпись для скринридера; на экране — только placeholder */
  label: string
  placeholder?: string
  /** Подсказка сочетания, пока поле пустое: «Ctrl K» */
  shortcut?: string
  value: string
  onChange: (value: string) => void
  sections: SearchComboSection[]
  /** Выбрали найденное: щелчком или Enter */
  onAction: (id: string) => void
  /** Текст, когда по запросу ничего нет; без него пустой список не открывается */
  emptyText?: string
  inputRef?: RefObject<HTMLInputElement | null>
  /** Ширина списка: он шире поля, чтобы названия помещались */
  listWidth?: number
  /** Подпись крестика, который очищает поле */
  clearLabel?: string
  className?: string
}

type Collected = SearchComboSection | SearchComboItem

function Option({ node, state }: { node: Node<Collected>; state: ComboBoxState<Collected> }) {
  const ref = useRef<HTMLLIElement>(null)
  const { optionProps, labelProps, descriptionProps, isFocused } = useOption({ key: node.key }, state, ref)
  const item = node.value as SearchComboItem
  return (
    <li
      {...optionProps}
      ref={ref}
      {...dataFlags({ focused: isFocused })}
      className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2 py-1.5 outline-none data-[focused]:bg-hover-2"
    >
      {item.icon ? <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-sm bg-raise text-fg-2">{item.icon}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span {...labelProps} className="truncate text-base text-fg">
          {item.label}
        </span>
        {item.description ? (
          <span {...descriptionProps} className="truncate text-xs text-fg-3">
            {item.description}
          </span>
        ) : null}
      </span>
      {item.meta ? <span className="shrink-0 text-xs text-fg-3">{item.meta}</span> : null}
    </li>
  )
}

function ResultSection({ section, state }: { section: Node<Collected>; state: ComboBoxState<Collected> }) {
  const { itemProps, headingProps, groupProps } = useListBoxSection({ heading: section.rendered, 'aria-label': section['aria-label'] })
  return (
    <li {...itemProps} className="flex flex-col gap-0.5 pt-1 first:pt-0">
      <span {...headingProps} className="px-2 pt-1.5 pb-1 text-2xs font-semibold tracking-caps text-fg-3 uppercase">
        {section.rendered}
      </span>
      <ul {...groupProps} className="flex flex-col gap-0.5">
        {[...section.childNodes].map((node) => (
          <Option key={node.key} node={node} state={state} />
        ))}
      </ul>
    </li>
  )
}

interface ResultsProps extends AriaListBoxOptions<Collected> {
  state: ComboBoxState<Collected>
  listBoxRef: RefObject<HTMLUListElement | null>
  emptyText?: string
}

function Results({ state, listBoxRef: ref, emptyText, ...props }: ResultsProps) {
  const { listBoxProps } = useListBox(props, state, ref)
  return (
    <ScrollArea viewportStyle={{ maxHeight: 440 }}>
      <ul {...listBoxProps} ref={ref} className="flex flex-col p-1.5 outline-none">
        {[...state.collection].map((node) =>
          node.type === 'section' ? <ResultSection key={node.key} section={node} state={state} /> : <Option key={node.key} node={node} state={state} />,
        )}
      </ul>
      {state.collection.size === 0 && emptyText ? <p className="px-3.5 py-3 text-sm text-fg-3">{emptyText}</p> : null}
    </ScrollArea>
  )
}

/**
 * Поиск с выпадающим списком найденного, по группам: стрелки двигают выбор, Enter открывает,
 * Escape закрывает список, второй Escape очищает поле. Список рядом с полем, а не отдельный экран
 */
export function SearchCombo({
  label,
  placeholder,
  shortcut,
  value,
  onChange,
  sections,
  onAction,
  emptyText,
  inputRef: outerRef,
  listWidth = 440,
  clearLabel = 'Очистить',
  className,
}: SearchComboProps) {
  const ownRef = useRef<HTMLInputElement>(null)
  const inputRef = outerRef ?? ownRef
  const listBoxRef = useRef<HTMLUListElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const clearRef = useRef<HTMLButtonElement>(null)

  const state = useComboBoxState<Collected>({
    items: sections,
    children: (section) => (
      <Section key={section.id} title={(section as SearchComboSection).title} items={(section as SearchComboSection).items}>
        {(item) => (
          <Item key={item.id} textValue={item.label}>
            {item.label}
          </Item>
        )}
      </Section>
    ),
    inputValue: value,
    onInputChange: onChange,
    selectedKey: null,
    onSelectionChange: (key) => {
      if (key != null) onAction(String(key))
    },
    allowsCustomValue: true,
    allowsEmptyCollection: Boolean(emptyText) && value.trim().length > 0,
    menuTrigger: 'input',
  })
  const { inputProps, listBoxProps, labelProps } = useComboBox(
    { label, placeholder, inputRef, listBoxRef, popoverRef, allowsCustomValue: true, menuTrigger: 'input' },
    state,
  )
  const { buttonProps } = useButton(
    {
      'aria-label': clearLabel,
      excludeFromTabOrder: true,
      onPress: () => {
        onChange('')
        inputRef.current?.focus()
      },
    },
    clearRef,
  )
  const { hoverProps, isHovered } = useHover({})
  const presence = usePresence(state.isOpen, 150)

  // Results come after the typing (a search in the core): the list opens the moment they
  // arrive — once, so Escape still closes it
  const hasContent = sections.length > 0 || (Boolean(emptyText) && value.trim().length > 0)
  const hadContent = useRef(hasContent)
  const { isFocused, isOpen, open } = state
  useEffect(() => {
    if (hasContent && !hadContent.current && isFocused && value.trim() && !isOpen) open(null, 'manual')
    hadContent.current = hasContent
  }, [hasContent, isFocused, value, isOpen, open])

  return (
    <div
      ref={fieldRef}
      {...hoverProps}
      {...dataFlags({ hovered: isHovered })}
      className={cn(
        'flex h-[34px] min-w-36 items-center gap-2 rounded-md border border-line-2 bg-panel pr-1 pl-3 text-fg-3',
        'transition-[border-color] duration-(--duration-fast) data-[hovered]:border-fg-3 focus-within:border-accent!',
        className,
      )}
    >
      <label {...labelProps} className="sr-only">
        {label}
      </label>
      <IconSearch size={16} className="shrink-0" />
      <input
        {...mergeProps(inputProps)}
        ref={inputRef}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
      />
      {value ? (
        <button {...buttonProps} ref={clearRef} className="grid size-6 shrink-0 place-items-center rounded-xs text-fg-3 hover:bg-hover-2 hover:text-fg">
          <IconClose size={14} />
        </button>
      ) : shortcut ? (
        <Kbd className="mr-0.5">{shortcut}</Kbd>
      ) : null}
      {presence.isMounted ? (
        <Popover state={state} triggerRef={fieldRef} popoverRef={popoverRef} isNonModal isExiting={presence.isExiting} placement="bottom start">
          <div style={{ width: listWidth }}>
            <Results {...listBoxProps} state={state} listBoxRef={listBoxRef} emptyText={emptyText} />
          </div>
        </Popover>
      ) : null}
    </div>
  )
}
