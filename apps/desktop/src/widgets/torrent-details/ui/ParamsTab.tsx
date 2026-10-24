import { Button, IconDownload, IconFolder, IconRefresh, SegmentedControl, TextField, useToast } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { appIpc } from '../../../shared/ipc/app'
import { linksIpc } from '../../../shared/ipc/links'
import { torrentsIpc, type ActiveTorrent, type Seeding } from '../../../shared/ipc/torrents'

/**
 * «Параметры торрента» (SPEC 4.3) — what the engine allows: the torrent's own seeding, a full check
 * of the files, a re-announce, moving the files, the .torrent saved elsewhere
 */
export function ParamsTab({ torrent, seeding, onChanged }: { torrent: ActiveTorrent; seeding: Seeding; onChanged: () => void }) {
  const { t } = useTranslation('torrents')
  const toast = useToast()
  const [ratio, setRatio] = useState(seeding.mode === 'ratio' ? String(seeding.ratio) : '2')
  useEffect(() => {
    if (seeding.mode === 'ratio') setRatio(String(seeding.ratio))
  }, [seeding])

  const run = (what: string, action: () => Promise<unknown>, done?: string) =>
    void action()
      .then(() => {
        if (done) toast.show({ title: done, tone: 'success' })
        onChanged()
      })
      .catch((e: unknown) => {
        console.error(`[torrents] ${what}`, e)
        toast.show({ title: String(e), tone: 'danger', duration: 6000 })
      })

  const setSeeding = (next: Seeding) => run('seeding', () => torrentsIpc.setSeeding(torrent.id, next))
  const ratioValue = () => Math.max(0.1, Number(ratio.replace(',', '.')) || 2)

  const move = async () => {
    const folder = await appIpc.pickFolder(t('params.moveTitle'))
    if (folder) run('move', () => linksIpc.moveTorrent(torrent.id, folder), t('params.moved', { folder }))
  }
  const save = async () => {
    const path = await appIpc.pickTorrentTarget(t('params.saveTitle'), `${torrent.name}.torrent`, t('params.torrentFilter'))
    if (path) run('save', () => torrentsIpc.saveFile(torrent.id, path), t('params.saved'))
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5">
        <h3 className="text-2xs font-semibold tracking-caps text-fg-3 uppercase">{t('params.seeding')}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            aria-label={t('params.seeding')}
            options={[
              { value: 'default', label: t('params.seedDefault') },
              { value: 'ratio', label: t('params.seedRatio') },
              { value: 'never', label: t('params.seedNever') },
            ]}
            value={seeding.mode}
            onChange={(mode) => setSeeding(mode === 'ratio' ? { mode, ratio: ratioValue() } : { mode: mode as 'default' | 'never' })}
          />
          {seeding.mode === 'ratio' ? (
            <TextField
              label={t('params.ratio')}
              showLabel={false}
              value={ratio}
              onChange={setRatio}
              onBlur={() => setSeeding({ mode: 'ratio', ratio: ratioValue() })}
              onKeyDown={(e) => e.key === 'Enter' && setSeeding({ mode: 'ratio', ratio: ratioValue() })}
              inputMode="decimal"
              mono
              className="w-24"
            />
          ) : null}
        </div>
        <p className="text-sm text-fg-3">{t(`params.seedHint.${seeding.mode}`)}</p>
      </section>
      <section className="flex flex-col gap-2.5">
        <h3 className="text-2xs font-semibold tracking-caps text-fg-3 uppercase">{t('params.actions')}</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={<IconRefresh size={14} />} onPress={() => run('recheck', () => torrentsIpc.recheck(torrent.id), t('params.rechecking'))}>
            {t('params.recheck')}
          </Button>
          <Button variant="outline" size="sm" onPress={() => run('reannounce', () => torrentsIpc.reannounce(torrent.id), t('params.reannounced'))}>
            {t('params.reannounce')}
          </Button>
          <Button variant="outline" size="sm" icon={<IconFolder size={14} />} onPress={() => void move()}>
            {t('params.move')}
          </Button>
          <Button variant="outline" size="sm" icon={<IconDownload size={14} />} onPress={() => void save()}>
            {t('params.saveTorrent')}
          </Button>
        </div>
        <p className="text-xs text-fg-3">{t('params.engineNote')}</p>
      </section>
    </div>
  )
}
