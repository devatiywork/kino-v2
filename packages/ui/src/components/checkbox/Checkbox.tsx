import { useRef, type ReactNode } from 'react'
import { mergeProps, useCheckbox, useFocusRing, useHover, VisuallyHidden, type AriaCheckboxProps } from 'react-aria'
import { useToggleState } from 'react-stately'
import { IconCheck } from '../../icons'
import { dataFlags } from '../../lib/focusRing'
import { tv } from '../../lib/tv'

const checkboxStyles = tv({
  slots: {
    // relative: скрытый input остаётся на месте флажка — фокус не уводит прокрутку
    root: 'group relative inline-flex min-w-0 items-center gap-2.5 data-[disabled]:opacity-40',
    box: [
      'grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-2 bg-field text-on-accent',
      'transition-[background-color,border-color,scale] duration-(--duration-fast)',
      'group-data-[hovered]:border-fg-3 group-data-[pressed]:scale-90',
      'group-data-[selected]:border-accent group-data-[selected]:bg-accent',
      'group-data-[indeterminate]:border-accent group-data-[indeterminate]:bg-accent',
      'group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-accent group-data-[focus-visible]:ring-offset-2 group-data-[focus-visible]:ring-offset-bg',
    ],
    dash: 'h-0.5 w-2 rounded-full bg-on-accent',
    label: 'min-w-0 truncate text-base text-fg',
  },
})

export interface CheckboxProps extends AriaCheckboxProps {
  children?: ReactNode
  className?: string
}

/** Флажок: выбрать файл, «выбрать все» (isIndeterminate — выбрана часть). Без текста передайте aria-label */
export function Checkbox({ children, className, ...props }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)
  const state = useToggleState(props)
  const { inputProps, labelProps, isSelected, isDisabled, isPressed } = useCheckbox({ ...props, children }, state, ref)
  const { focusProps, isFocusVisible } = useFocusRing()
  const { hoverProps, isHovered } = useHover({ isDisabled })
  const indeterminate = props.isIndeterminate === true
  const s = checkboxStyles()

  return (
    <label
      {...mergeProps(labelProps, hoverProps)}
      {...dataFlags({
        selected: isSelected && !indeterminate,
        indeterminate,
        disabled: isDisabled,
        pressed: isPressed,
        hovered: isHovered,
        'focus-visible': isFocusVisible,
      })}
      className={s.root({ className })}
    >
      <VisuallyHidden>
        <input {...mergeProps(inputProps, focusProps)} ref={ref} />
      </VisuallyHidden>
      <span aria-hidden="true" className={s.box()}>
        {indeterminate ? <span className={s.dash()} /> : isSelected ? <IconCheck size={13} strokeWidth={2.6} /> : null}
      </span>
      {children ? <span className={s.label()}>{children}</span> : null}
    </label>
  )
}
