import { Button, IconFileAdd } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useOpenVideo } from '../model/useOpenVideo'

/** `narrow` — in the title bar: only the icon in a window narrower than 1200 px */
export function OpenFileButton({ size = 'md', label, narrow }: { size?: 'md' | 'lg'; label?: string; narrow?: boolean }) {
  const { t } = useTranslation()
  const { pickAndOpen } = useOpenVideo()
  return (
    <Button
      variant="primary"
      size={size}
      icon={<IconFileAdd size={size === 'lg' ? 18 : 16} />}
      onPress={() => void pickAndOpen()}
      className={narrow ? 'max-[1200px]:px-2.5' : undefined}
    >
      <span className={narrow ? 'max-[1200px]:sr-only' : undefined}>{label ?? t('open.button')}</span>
    </Button>
  )
}
