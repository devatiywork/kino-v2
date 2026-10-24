import { useTranslation } from 'react-i18next'
import { refreshCategories, useTorrents } from '../../../../../entities/torrent'
import { CategoryList } from '../../../../../features/manage-categories'
import { SettingGroup, SettingRow, SettingsSection } from '../../SettingsLayout'
import { badTrackerLines } from './checks'
import { ConnectionRows } from './ConnectionRows'
import { FolderField, NumberField, SwitchRow, TextSetting } from './fields'
import { SeedingRows } from './SeedingRows'
import { SpeedRows } from './SpeedRows'

/**
 * SPEC 6 «Загрузки», by qBittorrent's groups: adding and folders, speed, seeding, the queue, the
 * connection, behaviour. Every change applies at once; the connection — after a restart
 */
export function DownloadsSection() {
  const { t } = useTranslation('settings')
  const folder = useTorrents((s) => s.downloadsFolder)

  return (
    <SettingsSection id="downloads" title={t('downloads.title')}>
      <SettingGroup title={t('downloads.groups.adding')} />
      <SettingRow label={t('downloads.folder')} hint={t('downloads.folderHint')} stacked>
        <FolderField
          setting="downloadsFolder"
          title={t('downloads.folder')}
          empty={`${folder} · ${t('downloads.systemFolder')}`}
          onChanged={refreshCategories}
        />
      </SettingRow>
      <SettingRow label={t('downloads.categories')} hint={t('downloads.categoriesHint')} stacked>
        <CategoryList />
      </SettingRow>
      <SettingRow label={t('downloads.incompleteFolder')} hint={t('downloads.incompleteFolderHint')} stacked>
        <FolderField setting="incompleteFolder" title={t('downloads.incompleteFolder')} empty={t('downloads.incompleteOff')} />
      </SettingRow>
      <SwitchRow setting="showAddDialog" label={t('downloads.showAddDialog')} hint={t('downloads.showAddDialogHint')} />
      <SwitchRow setting="startPaused" label={t('downloads.startPaused')} hint={t('downloads.startPausedHint')} />
      <SwitchRow setting="deleteTorrentFile" label={t('downloads.deleteTorrentFile')} hint={t('downloads.deleteTorrentFileHint')} />
      <SwitchRow setting="mergeTrackers" label={t('downloads.mergeTrackers')} hint={t('downloads.mergeTrackersHint')} />
      <SettingRow label={t('downloads.extraTrackers')} hint={t('downloads.extraTrackersHint')} stacked>
        <TextSetting
          label={t('downloads.extraTrackers')}
          setting="extraTrackers"
          multiline
          placeholder="udp://tracker.example.org:6969/announce"
          check={(v) => {
            const bad = badTrackerLines(v)
            return bad.length ? t('downloads.extraTrackersError', { line: bad[0] }) : null
          }}
        />
      </SettingRow>

      <SettingGroup title={t('downloads.groups.speed')} />
      <SpeedRows />

      <SettingGroup title={t('downloads.groups.seeding')} />
      <SeedingRows />

      <SettingGroup title={t('downloads.groups.queue')} hint={t('downloads.queueHint')} />
      <SettingRow label={t('downloads.maxActive')}>
        <NumberField label={t('downloads.maxActive')} setting="maxActiveDownloads" max={100} className="w-28" />
      </SettingRow>
      <SettingRow label={t('downloads.maxSeeds')}>
        <NumberField label={t('downloads.maxSeeds')} setting="maxActiveSeeds" max={100} className="w-28" />
      </SettingRow>
      <SettingRow label={t('downloads.maxTotal')} hint={t('downloads.maxTotalHint')}>
        <NumberField label={t('downloads.maxTotal')} setting="maxActiveTotal" max={100} className="w-28" />
      </SettingRow>
      <SwitchRow setting="queueSkipSlow" label={t('downloads.skipSlow')} hint={t('downloads.skipSlowHint')} />

      <SettingGroup title={t('downloads.groups.connection')} hint={t('downloads.afterRestart')} />
      <ConnectionRows />

      <SettingGroup title={t('downloads.groups.behaviour')} />
      <SwitchRow setting="closeToTray" label={t('downloads.closeToTray')} hint={t('downloads.closeToTrayHint')} />
      <SwitchRow setting="notifyFinished" label={t('downloads.notifyFinished')} hint={t('downloads.notifyFinishedHint')} />
      <SwitchRow setting="keepAwakeDownloads" label={t('downloads.keepAwake')} hint={t('downloads.keepAwakeHint')} />
    </SettingsSection>
  )
}
