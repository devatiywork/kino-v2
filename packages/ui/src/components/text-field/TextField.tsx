import { useRef, type ReactNode } from 'react'
import { useHover, useTextField, type AriaTextFieldProps } from 'react-aria'
import { cn } from '../../lib/cn'

export interface TextFieldProps extends AriaTextFieldProps {
  /** Подпись над полем; showLabel={false} — только для скринридера */
  label: string
  showLabel?: boolean
  /** Пояснение под полем */
  description?: ReactNode
  /** Что не так, пока isInvalid */
  errorMessage?: string
  /** Моноширинный шрифт: пути, ссылки, хеши */
  mono?: boolean
  /** Кнопка справа внутри поля: «Обзор…» */
  addon?: ReactNode
  className?: string
}

/** Текстовое поле: название, папка, magnet-ссылка. Системное меню правого клика работает только здесь */
export function TextField({ label, showLabel = true, description, errorMessage, mono, addon, className, ...props }: TextFieldProps) {
  const ref = useRef<HTMLInputElement>(null)
  const { labelProps, inputProps, descriptionProps, errorMessageProps, isInvalid } = useTextField(
    { ...props, label, description: typeof description === 'string' ? description : undefined, errorMessage },
    ref,
  )
  const { hoverProps, isHovered } = useHover({ isDisabled: props.isDisabled })

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', props.isDisabled && 'opacity-40', className)}>
      <label {...labelProps} className={showLabel ? 'text-sm font-medium text-fg-2' : 'sr-only'}>
        {label}
      </label>
      <div
        {...hoverProps}
        data-hovered={isHovered || undefined}
        data-invalid={isInvalid || undefined}
        className={cn(
          'flex h-[34px] min-w-0 items-center gap-1 rounded-md border border-line-2 bg-bg pr-1 pl-3',
          'transition-[border-color] duration-(--duration-fast) data-[hovered]:border-fg-3 focus-within:border-accent!',
          'data-[invalid]:border-danger',
        )}
      >
        <input
          {...inputProps}
          ref={ref}
          className={cn(
            'h-full min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-3',
            mono && 'font-mono text-sm',
          )}
        />
        {addon}
      </div>
      {description ? (
        <span {...descriptionProps} className="text-xs leading-snug text-fg-3">
          {description}
        </span>
      ) : null}
      {isInvalid && errorMessage ? (
        <span {...errorMessageProps} className="text-xs text-danger">
          {errorMessage}
        </span>
      ) : null}
    </div>
  )
}
