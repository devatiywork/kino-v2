import { applyTheme, installDesktopGuards, ToastProvider } from '@kino/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initI18n } from '../shared/i18n'
import { App } from './App'
import './styles/app.css'

installDesktopGuards({ allowDevtools: import.meta.env.DEV })
// Dark until the settings screen stores the choice
applyTheme('dark')
await initI18n('ru')

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
