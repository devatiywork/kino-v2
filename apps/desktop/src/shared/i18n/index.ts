import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enCommon from './en/common.json'
import enLibrary from './en/library.json'
import enPlayer from './en/player.json'
import ruCommon from './ru/common.json'
import ruLibrary from './ru/library.json'
import ruPlayer from './ru/player.json'

export const resources = {
  ru: { common: ruCommon, player: ruPlayer, library: ruLibrary },
  en: { common: enCommon, player: enPlayer, library: enLibrary },
} as const

export type Language = keyof typeof resources

/** Russian by default; the language setting comes with the settings screen */
export async function initI18n(language: Language = 'ru'): Promise<typeof i18n> {
  await i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'ru',
    ns: ['common', 'player', 'library'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  return i18n
}

export { i18n }
