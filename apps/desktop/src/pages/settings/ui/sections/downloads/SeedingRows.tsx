import { ConfirmDialog, SegmentedControl, Switch, useToast } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../../entities/settings'
import { useTorrents } from '../../../../../entities/torrent'
import type { SeedLimitAction } from '../../../../../shared/ipc/settings'
import { torrentsIpc } from '../../../../../shared/ipc/torrents'
import { options } from '../../../lib/options'
import { SettingRow } from '../../SettingsLayout'
import { NumberField } from './fields'

const ACTIONS: SeedLimitAction[] = ['pause', 'archive']

/**
 * «Не раздавать после загрузки — сразу в архив» (SPEC 4.3): switching it on asks about what
 * already seeds. Otherwise seeding stops by the ratio or the time (SPEC 6), unless a torrent has
 * its own rule
 */
export function SeedingRows() {
  const { t } = useTranslation('settings')
  const { t: tt } = useTranslation('torrents')
  const toast = useToast()
  const noSeeding = useSettings((s) => s.noSeeding)
  const action = useSettings((s) => s.seedLimitAction)
  const seeding = useTorrents((s) => s.active.filter((x) => x.state === 'seeding').length)
  const [asking, setAsking] = useState(0)

  const toggle = (on: boolean) => {
    void updateSettings({ noSeeding: on })
    if (on && seeding) setAsking(seeding)
  }
  const archiveSeeding = async () => {
    const moved = await torrentsIpc.archiveSeeding()
    toast.show({ title: tt('toast.archivedSeeding', { count: moved }), tone: 'success' })
  }

  return (
    <>
      <SettingRow label={t('downloads.noSeeding')} hint={t('downloads.noSeedingHint')}>
        <Switch aria-label={t('downloads.noSeeding')} isSelected={noSeeding} onChange={toggle} />
      </SettingRow>
      <SettingRow label={t('downloads.seedRatio')} hint={t('downloads.seedRatioHint')}>
        <NumberField label={t('downloads.seedRatio')} setting="seedRatioLimit" max={1000} decimal isDisabled={noSeeding} className="w-28" />
      </SettingRow>
      <SettingRow label={t('downloads.seedTime')} hint={t('downloads.seedTimeHint')}>
        <NumberField label={t('downloads.seedTime')} setting="seedTimeLimit" max={525_600} isDisabled={noSeeding} className="w-28" />
      </SettingRow>
      <SettingRow label={t('downloads.seedAction')}>
        <SegmentedControl
          aria-label={t('downloads.seedAction')}
          options={options(ACTIONS, (v) => t(`downloads.seedActions.${v}`))}
          value={action}
          onChange={(value) => void updateSettings({ seedLimitAction: value })}
          isDisabled={noSeeding}
        />
      </SettingRow>
      <ConfirmDialog
        isOpen={asking > 0}
        onOpenChange={(open) => !open && setAsking(0)}
        title={t('downloads.noSeedingTitle')}
        description={t('downloads.noSeedingText', { count: asking })}
        confirmLabel={t('downloads.noSeedingConfirm')}
        cancelLabel={t('downloads.noSeedingKeep')}
        onConfirm={() => void archiveSeeding().catch((e: unknown) => console.error('[torrents] archive seeding', e))}
      />
    </>
  )
}
