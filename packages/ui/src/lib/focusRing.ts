/** Кольцо фокуса для навигации с клавиатуры. Компоненты выставляют data-focus-visible через react-aria */
export const focusRing =
  'outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-accent data-[focus-visible]:ring-offset-2 data-[focus-visible]:ring-offset-bg'

/** Превращает флаги состояния в data-атрибуты: true → "", false → атрибута нет */
export function dataFlags(flags: Record<string, boolean | undefined>): Record<string, '' | undefined> {
  const out: Record<string, '' | undefined> = {}
  for (const [name, value] of Object.entries(flags)) out[`data-${name}`] = value ? '' : undefined
  return out
}
