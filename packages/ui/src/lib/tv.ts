import { createTV } from 'tailwind-variants'
import { twMergeConfig } from './cn'

/** tailwind-variants, который знает наши токены */
export const tv = createTV({ twMergeConfig })
export type { VariantProps } from 'tailwind-variants'
