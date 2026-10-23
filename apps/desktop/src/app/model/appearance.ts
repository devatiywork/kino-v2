import { applyAccent, applyTheme } from '@kino/ui'
import { settingsStore } from '../../entities/settings'
import { i18n } from '../../shared/i18n'
import type { Settings } from '../../shared/ipc/settings'

type Appearance = Pick<Settings, 'theme' | 'accent' | 'language'>

/**
 * Theme, accent and language follow the settings at once, without a restart (SPEC 6).
 * Called once, before the first render. Returns the unsubscribe
 */
export function startAppearance(): () => void {
  let applied: Appearance | null = null
  let stopTheme = () => {}
  const apply = () => {
    const { theme, accent, language } = settingsStore.get()
    if (theme !== applied?.theme) {
      stopTheme()
      // «Как в Windows» keeps following the system switch
      stopTheme = applyTheme(theme)
    }
    if (accent !== applied?.accent) applyAccent(accent)
    if (language !== applied?.language) {
      document.documentElement.lang = language
      if (i18n.language !== language) i18n.changeLanguage(language).catch((e: unknown) => console.error('[i18n] language', e))
    }
    applied = { theme, accent, language }
  }
  apply()
  const unsubscribe = settingsStore.subscribe(apply)
  return () => {
    unsubscribe()
    stopTheme()
  }
}
