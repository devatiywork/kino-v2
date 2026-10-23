import { Button, IconMagnet, IconPlus, useToast } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { appIpc } from '../../../shared/ipc/app'
import { openMagnetDialog, openTorrentFile } from '../model/addTorrent'

/** The downloads header: «Magnet-ссылка» and «Добавить торрент» (a .torrent from the picker) */
export function AddTorrentButtons() {
  const { t } = useTranslation('torrents')
  const toast = useToast()

  const pick = async () => {
    const path = await appIpc.pickTorrentFile(t('addTorrent'), 'Torrent')
    if (!path) return
    try {
      await openTorrentFile(path)
    } catch (e: unknown) {
      toast.show({ title: t('toast.notTorrent', { message: String(e) }), tone: 'danger', duration: 6000 })
    }
  }

  return (
    <>
      <Button variant="outline" icon={<IconMagnet size={16} />} onPress={() => openMagnetDialog()}>
        {t('addMagnet')}
      </Button>
      <Button variant="primary" icon={<IconPlus size={16} />} onPress={() => void pick()}>
        {t('addTorrent')}
      </Button>
    </>
  )
}
