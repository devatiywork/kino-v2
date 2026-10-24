import { useRef, type ReactNode, type TextareaHTMLAttributes } from 'react'
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
  /** Несколько строк: список трекеров, заметка */
  multiline?: boolean
  rows?: number
  className?: string
}

/** Текстовое поле: название, папка, magnet-ссылка. Системное меню правого клика работает только здесь */
export function TextField({ label, showLabel = true, description, errorMessage, mono, addon, multiline, rows = 4, className, ...props }: TextFieldProps) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const { labelProps, inputProps, descriptionProps, errorMessageProps, isInvalid } = useTextField(
    {
      ...props,
      label,
      description: typeof description === 'string' ? description : undefined,
      errorMessage,
      // react-aria types the props by the element; for a textarea it only leaves out `type`
      inputElementType: (multiline ? 'textarea' : 'input') as 'input',
    },
    ref,
  )
  const text = cn('min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-3', mono && 'font-mono text-sm')
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
          'flex min-w-0 gap-1 rounded-md border border-line-2 bg-field pr-1 pl-3',
          multiline ? 'items-start py-2' : 'h-[34px] items-center',
          'transition-[border-color] duration-(--duration-fast) data-[hovered]:border-fg-3 focus-within:border-accent!',
          'data-[invalid]:border-danger',
        )}
      >
        {multiline ? (
          <textarea {...(inputProps as TextareaHTMLAttributes<HTMLTextAreaElement>)} ref={ref} rows={rows} className={cn(text, 'resize-y leading-relaxed')} />
        ) : (
          <input {...inputProps} ref={ref} className={cn(text, 'h-full')} />
        )}
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
