export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Какая тема получится на самом деле: «как в системе» смотрит на настройку Windows */
export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light'
  return mode
}

/**
 * Применяет тему к корню документа (атрибут data-theme). В режиме «как в системе»
 * следит за переключением темы Windows и меняет тему без перезапуска.
 * Возвращает функцию, которая прекращает слежение.
 */
export function applyTheme(mode: ThemeMode, root: HTMLElement = document.documentElement): () => void {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
  const set = () => {
    root.dataset.theme = resolveTheme(mode, media?.matches ?? true)
  }
  set()
  if (mode !== 'system' || !media) return () => undefined
  media.addEventListener('change', set)
  return () => media.removeEventListener('change', set)
}

/** Пользовательский акцентный цвет поверх темы. null — вернуть акцент темы */
export function applyAccent(color: string | null, root: HTMLElement = document.documentElement): void {
  if (color) root.style.setProperty('--kino-accent-custom', color)
  else root.style.removeProperty('--kino-accent-custom')
}
