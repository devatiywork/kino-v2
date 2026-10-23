import { useRef } from 'react'
import {
  mergeProps,
  useFocusRing,
  useHover,
  useNumberFormatter,
  useSlider,
  useSliderThumb,
  VisuallyHidden,
  type AriaSliderProps,
} from 'react-aria'
import { useSliderState } from 'react-stately'
import { dataFlags } from '../../lib/focusRing'
import { tv } from '../../lib/tv'

const sliderStyles = tv({
  slots: {
    root: 'group flex w-full items-center gap-3 data-[disabled]:opacity-40',
    label: 'text-sm text-fg-2',
    track: 'relative h-5 flex-1 touch-none',
    rail: 'absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-track transition-[height] duration-(--duration-fast) group-data-[hovered]:h-1.5',
    fill: 'absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-accent transition-[height] duration-(--duration-fast) group-data-[hovered]:h-1.5',
    thumb: [
      'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-thumb',
      'scale-0 transition-[scale] duration-(--duration-fast)',
      'group-data-[hovered]:scale-100 data-[dragging]:scale-110 data-[focus-visible]:scale-100',
      'data-[focus-visible]:ring-2 data-[focus-visible]:ring-fg',
    ],
    output: 'min-w-8 text-right font-mono text-xs text-fg-2',
  },
})

export interface SliderProps extends AriaSliderProps<number> {
  /** Подпись обязательна; по умолчанию видна только скринридеру */
  label: string
  showLabel?: boolean
  showValue?: boolean
  formatOptions?: Intl.NumberFormatOptions
  className?: string
}

/** Горизонтальный слайдер: громкость, позиция в настройках. Своя дорожка и ползунок, без input[type=range] */
export function Slider({ label, showLabel = false, showValue = false, formatOptions, className, ...props }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const numberFormatter = useNumberFormatter(formatOptions)
  const state = useSliderState({ ...props, label, numberFormatter })
  const { groupProps, trackProps, labelProps, outputProps } = useSlider({ ...props, label }, state, trackRef)
  const { thumbProps, inputProps, isDragging } = useSliderThumb({ index: 0, trackRef, inputRef, isDisabled: props.isDisabled }, state)
  const { focusProps, isFocusVisible } = useFocusRing()
  const { hoverProps, isHovered } = useHover({ isDisabled: props.isDisabled })
  const percent = `${state.getThumbPercent(0) * 100}%`
  const s = sliderStyles()

  return (
    <div
      {...mergeProps(groupProps, hoverProps)}
      {...dataFlags({ disabled: props.isDisabled, hovered: isHovered || isDragging })}
      className={s.root({ className })}
    >
      {showLabel ? (
        <label {...labelProps} className={s.label()}>
          {label}
        </label>
      ) : (
        <VisuallyHidden>
          <label {...labelProps}>{label}</label>
        </VisuallyHidden>
      )}
      <div {...trackProps} ref={trackRef} className={s.track()}>
        <div className={s.rail()} />
        <div className={s.fill()} style={{ width: percent }} />
        <div
          {...thumbProps}
          {...dataFlags({ dragging: isDragging, 'focus-visible': isFocusVisible })}
          className={s.thumb()}
          style={{ left: percent }}
        >
          <VisuallyHidden>
            <input ref={inputRef} {...mergeProps(inputProps, focusProps)} />
          </VisuallyHidden>
        </div>
      </div>
      {showValue ? (
        <output {...outputProps} className={s.output()}>
          {state.getThumbValueLabel(0)}
        </output>
      ) : null}
    </div>
  )
}
