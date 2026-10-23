import { Button, IconFileAdd } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useOpenVideo } from '../model/useOpenVideo'

export function OpenFileButton({ size = 'md', label }: { size?: 'md' | 'lg'; label?: string }) {
  const { t } = useTranslation()
  const { pickAndOpen } = useOpenVideo()
  return (
    <Button variant="primary" size={size} icon={<IconFileAdd size={size === 'lg' ? 18 : 16} />} onPress={() => void pickAndOpen()}>
      {label ?? t('open.button')}
    </Button>
  )
}
