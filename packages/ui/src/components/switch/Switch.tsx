import { useRef } from 'react'
import { mergeProps, useFocusRing, useSwitch, VisuallyHidden, type AriaSwitchProps } from 'react-aria'
import { useToggleState } from 'react-stately'
import { dataFlags } from '../../lib/focusRing'
import { tv } from '../../lib/tv'

const switchStyles = tv({
  slots: {
    root: 'group inline-flex items-center gap-3 data-[disabled]:opacity-40',
    track: [
      'relative h-6 w-10 shrink-0 rounded-full bg-raise-2 transition-colors duration-(--duration-fast)',
      'group-data-[selected]:bg-accent',
      'group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-accent group-data-[focus-visible]:ring-offset-2 group-data-[focus-visible]:ring-offset-bg',
    ],
    thumb: [
      'absolute top-[3px] left-[3px] size-[18px] rounded-full bg-fg-2',
      'transition-[translate,background-color,scale] duration-(--duration-base) ease-out',
      'group-data-[selected]:translate-x-4 group-data-[selected]:bg-on-accent group-data-[pressed]:scale-90',
    ],
    label: 'text-base text-fg',
  },
})

export interface SwitchProps extends AriaSwitchProps {
  className?: string
}

/** Переключатель вкл/выкл. Без видимого текста передайте aria-label */
export function Switch({ className, children, ...props }: SwitchProps) {
  const ref = useRef<HTMLInputElement>(null)
  const state = useToggleState(props)
  const { labelProps, inputProps, isSelected, isDisabled, isPressed } = useSwitch({ ...props, children }, state, ref)
  const { focusProps, isFocusVisible } = useFocusRing()
  const s = switchStyles()

  return (
    <label
      {...labelProps}
      {...dataFlags({ selected: isSelected, disabled: isDisabled, pressed: isPressed, 'focus-visible': isFocusVisible })}
      className={s.root({ className })}
    >
      <VisuallyHidden>
        <input {...mergeProps(inputProps, focusProps)} ref={ref} />
      </VisuallyHidden>
      <span aria-hidden="true" className={s.track()}>
        <span className={s.thumb()} />
      </span>
      {children ? <span className={s.label()}>{children}</span> : null}
    </label>
  )
}
