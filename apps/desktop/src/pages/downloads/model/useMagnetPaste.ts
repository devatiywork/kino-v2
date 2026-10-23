import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { openMagnetDialog, submitMagnet } from '../../../features/add-torrent'
import { findMagnet } from '../../../shared/ipc/torrents'

/** SPEC 4.1 «вставка из буфера»: Ctrl V with a magnet link on the downloads screen adds it */
export function useMagnetPaste(): void {
  const { t } = useTranslation('torrents')
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // A text field takes its own paste
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return
      const magnet = findMagnet(e.clipboardData?.getData('text') ?? '')
      if (!magnet) return
      e.preventDefault()
      openMagnetDialog()
      void submitMagnet(magnet, t('magnet.invalid'))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [t])
}
