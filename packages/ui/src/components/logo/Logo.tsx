import { tv, type VariantProps } from '../../lib/tv'

const logoStyles = tv({
  slots: {
    root: 'inline-flex items-center font-display leading-none font-semibold tracking-[-0.02em] text-fg',
    ring: 'shrink-0 rounded-full border-accent',
  },
  variants: {
    size: {
      sm: { root: 'text-[19px]', ring: 'mt-1 ml-px size-[15px] border-[3.5px]' },
      md: { root: 'text-[28px]', ring: 'mt-1.5 ml-0.5 size-[22px] border-[5px]' },
      lg: { root: 'text-[64px] tracking-[-0.04em]', ring: 'mt-2.5 ml-[3px] size-[46px] border-[10px]' },
    },
  },
  defaultVariants: { size: 'sm' },
})

export interface LogoProps extends VariantProps<typeof logoStyles> {
  className?: string
}

/** Знак Kino: «kin» и кольцо-объектив вместо «o» */
export function Logo({ size, className }: LogoProps) {
  const { root, ring } = logoStyles({ size })
  return (
    <span role="img" aria-label="Kino" className={root({ className })}>
      <span aria-hidden="true">kin</span>
      <span aria-hidden="true" className={ring()} />
    </span>
  )
}
