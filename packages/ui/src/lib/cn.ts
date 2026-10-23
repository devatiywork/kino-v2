import { extendTailwindMerge } from 'tailwind-merge'

/** Наши имена токенов, чтобы tailwind-merge правильно разрешал конфликты классов (text-fg-2 — цвет, text-sm — размер) */
export const twMergeConfig = {
  extend: {
    theme: {
      color: [
        'bg', 'panel', 'raise', 'raise-2', 'line', 'line-2',
        'fg', 'fg-2', 'fg-3', 'fg-4',
        'accent', 'accent-hover', 'accent-soft', 'accent-fg', 'on-accent', 'danger',
        'hover', 'hover-2', 'glass', 'glass-line', 'track', 'track-buffer', 'scrim', 'video',
        'win-close', 'win-close-fg', 'transparent', 'current',
      ],
      text: ['2xs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', 'hero'],
      radius: ['xs', 'sm', 'md', 'lg', 'xl', 'full'],
      shadow: ['pop', 'thumb'],
    },
  },
}

const twMerge = extendTailwindMerge(twMergeConfig)

/** Склеивает классы и убирает конфликтующие: последние побеждают */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(' '))
}
