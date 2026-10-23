import { installDesktopGuards, ToastProvider } from '@kino/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadSettings } from '../entities/settings'
import { initI18n } from '../shared/i18n'
import { App } from './App'
import { startAppearance } from './model/appearance'
import './styles/app.css'

installDesktopGuards({ allowDevtools: import.meta.env.DEV })
// The theme and the language before the first frame: nothing flashes
const settings = await loadSettings()
await initI18n(settings.language)
startAppearance()

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StrictMode>,
  )
}
