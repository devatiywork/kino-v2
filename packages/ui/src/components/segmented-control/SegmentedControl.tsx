import { createContext, useContext, useRef, type ReactNode } from 'react'
import { mergeProps, useFocusRing, useHover, useRadio, useRadioGroup, VisuallyHidden, type AriaRadioGroupProps } from 'react-aria'
import { useRadioGroupState, type RadioGroupState } from 'react-stately'
import { dataFlags } from '../../lib/focusRing'
import { tv, type VariantProps } from '../../lib/tv'

const segmentedStyles = tv({
  slots: {
    root: 'inline-flex gap-0.5 rounded-md border border-line-2 bg-bg p-[3px]',
    item: [
      'relative inline-flex items-center justify-center rounded-[7px] whitespace-nowrap text-fg-2',
      'transition-[background-color,color] duration-(--duration-fast)',
      'data-[hovered]:text-fg data-[selected]:bg-raise-2 data-[selected]:font-semibold data-[selected]:text-fg',
      'data-[disabled]:opacity-40',
      'data-[focus-visible]:ring-2 data-[focus-visible]:ring-accent',
    ],
  },
  variants: {
    size: {
      sm: { item: 'h-6 px-2 text-xs' },
      md: { item: 'h-7 px-3 text-sm' },
    },
  },
  defaultVariants: { size: 'md' },
})

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  isDisabled?: boolean
}

export interface SegmentedControlProps<T extends string>
  extends Omit<AriaRadioGroupProps, 'value' | 'defaultValue' | 'onChange' | 'orientation' | 'children'>,
    VariantProps<typeof segmentedStyles> {
  options: ReadonlyArray<SegmentedOption<T>>
  value?: T
  defaultValue?: T
  onChange?: (value: T) => void
  className?: string
}

interface SegmentedContextValue {
  state: RadioGroupState
  itemClass: string
}

const SegmentedContext = createContext<SegmentedContextValue | null>(null)

/** Выбор одного из нескольких вариантов. Стрелки ←/→ переключают, как у радиогруппы */
export function SegmentedControl<T extends string>({ options, onChange, size, className, ...props }: SegmentedControlProps<T>) {
  const groupProps = { ...props, orientation: 'horizontal' as const, onChange: onChange as ((value: string) => void) | undefined }
  const state = useRadioGroupState(groupProps)
  const { radioGroupProps } = useRadioGroup(groupProps, state)
  const s = segmentedStyles({ size })

  return (
    <div {...radioGroupProps} className={s.root({ className })}>
      <SegmentedContext.Provider value={{ state, itemClass: s.item() }}>
        {options.map((option) => (
          <Segment key={option.value} value={option.value} isDisabled={option.isDisabled}>
            {option.label}
          </Segment>
        ))}
      </SegmentedContext.Provider>
    </div>
  )
}

function Segment({ value, isDisabled, children }: { value: string; isDisabled?: boolean; children: ReactNode }) {
  const context = useContext(SegmentedContext)
  if (!context) throw new Error('Segment используется только внутри SegmentedControl')
  const ref = useRef<HTMLInputElement>(null)
  const { inputProps, isSelected, isDisabled: disabled, isPressed } = useRadio({ value, isDisabled, children }, context.state, ref)
  const { focusProps, isFocusVisible } = useFocusRing()
  const { hoverProps, isHovered } = useHover({ isDisabled: disabled })

  return (
    <label
      {...hoverProps}
      {...dataFlags({ selected: isSelected, disabled, pressed: isPressed, hovered: isHovered, 'focus-visible': isFocusVisible })}
      className={context.itemClass}
    >
      <VisuallyHidden>
        <input {...mergeProps(inputProps, focusProps)} ref={ref} />
      </VisuallyHidden>
      {children}
    </label>
  )
}
