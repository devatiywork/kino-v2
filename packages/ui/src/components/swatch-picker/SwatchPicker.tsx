import { createContext, useContext, useRef, type CSSProperties } from 'react'
import { mergeProps, useFocusRing, useHover, useRadio, useRadioGroup, VisuallyHidden, type AriaRadioGroupProps } from 'react-aria'
import { useRadioGroupState, type RadioGroupState } from 'react-stately'
import { dataFlags } from '../../lib/focusRing'
import { tv } from '../../lib/tv'
import { useTooltipFor } from '../tooltip/Tooltip'

const swatchStyles = tv({
  slots: {
    root: 'inline-flex items-center gap-2.5',
    item: [
      // grid: скрытая радиокнопка — в центре кружка, а не в срезанном скруглением углу
      'relative grid size-[26px] shrink-0 place-items-center rounded-full bg-(--swatch)',
      'transition-[box-shadow,scale] duration-(--duration-fast) ease-out',
      'data-[hovered]:scale-110 data-[pressed]:scale-95 data-[disabled]:opacity-40',
      // Выбранный — кольцо его же цвета с зазором цвета панели
      'data-[selected]:ring-2 data-[selected]:ring-(--swatch) data-[selected]:ring-offset-2 data-[selected]:ring-offset-panel',
      'data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-[5px] data-[focus-visible]:outline-fg-2',
    ],
  },
})

export interface SwatchOption<T extends string> {
  value: T
  /** Название цвета: для читалки экрана и подсказки */
  label: string
  /** Цвет образца — только токен: 'var(--kino-accent-teal)' */
  color: string
}

export interface SwatchPickerProps<T extends string>
  extends Omit<AriaRadioGroupProps, 'value' | 'defaultValue' | 'onChange' | 'orientation' | 'children'> {
  options: ReadonlyArray<SwatchOption<T>>
  value?: T
  defaultValue?: T
  onChange?: (value: T) => void
  className?: string
}

const SwatchContext = createContext<{ state: RadioGroupState; itemClass: string } | null>(null)

/** Выбор цвета из набора: кружки-образцы, радиогруппа со стрелками ←/→ */
export function SwatchPicker<T extends string>({ options, onChange, className, ...props }: SwatchPickerProps<T>) {
  const groupProps = { ...props, orientation: 'horizontal' as const, onChange: onChange as ((value: string) => void) | undefined }
  const state = useRadioGroupState(groupProps)
  const { radioGroupProps } = useRadioGroup(groupProps, state)
  const s = swatchStyles()

  return (
    <div {...radioGroupProps} className={s.root({ className })}>
      <SwatchContext.Provider value={{ state, itemClass: s.item() }}>
        {options.map((option) => (
          <Swatch key={option.value} {...option} />
        ))}
      </SwatchContext.Provider>
    </div>
  )
}

function Swatch({ value, label, color }: SwatchOption<string>) {
  const context = useContext(SwatchContext)
  if (!context) throw new Error('Swatch используется только внутри SwatchPicker')
  const ref = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLLabelElement>(null)
  const { inputProps, isSelected, isDisabled, isPressed } = useRadio({ value, 'aria-label': label }, context.state, ref)
  const { focusProps, isFocusVisible } = useFocusRing()
  const { hoverProps, isHovered } = useHover({ isDisabled })
  const { triggerProps, tooltip } = useTooltipFor({ content: label }, labelRef, label)

  return (
    <>
      <label
        ref={labelRef}
        {...mergeProps(hoverProps, triggerProps)}
        {...dataFlags({ selected: isSelected, disabled: isDisabled, pressed: isPressed, hovered: isHovered, 'focus-visible': isFocusVisible })}
        className={context.itemClass}
        style={{ '--swatch': color } as CSSProperties}
      >
        <VisuallyHidden>
          <input {...mergeProps(inputProps, focusProps)} ref={ref} />
        </VisuallyHidden>
      </label>
      {tooltip}
    </>
  )
}
