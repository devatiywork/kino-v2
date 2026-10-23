import type { ReactNode, SVGProps } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Размер в пикселях, по умолчанию 20 */
  size?: number
  /** Подпись для скринридера. Без неё иконка декоративная и скрыта от него */
  label?: string
}

export type IconComponent = ((props: IconProps) => ReactNode) & { displayName: string }

/** Все иконки — на сетке 24×24, линии 1.8, скругления round, цвет берётся из currentColor */
export function createIcon(name: string, paths: ReactNode): IconComponent {
  const Icon = ({ size = 20, label, strokeWidth = 1.8, ...rest }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      {...rest}
    >
      {paths}
    </svg>
  )
  Icon.displayName = `Icon${name}`
  return Icon
}
