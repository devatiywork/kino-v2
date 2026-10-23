import { Button, IconButton, IconFolder, IconPlus } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useAddFolder } from '../model/useAddFolder'

/** «Добавить папку»; `icon` — the folder button of the title bar */
export function AddFolderButton({ icon }: { icon?: boolean }) {
  const { t } = useTranslation('library')
  const { pickAndAdd } = useAddFolder()
  if (icon) {
    return (
      <IconButton label={t('addFolder')} tooltipPlacement="bottom" onPress={() => void pickAndAdd()}>
        <IconFolder size={19} />
      </IconButton>
    )
  }
  return (
    <Button variant="outline" size="sm" icon={<IconPlus size={14} />} onPress={() => void pickAndAdd()}>
      {t('addFolder')}
    </Button>
  )
}
