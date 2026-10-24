import { IconArrowDown, IconArrowUp, SegmentedControl } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../../entities/settings'
import type { ScheduleDays } from '../../../../../shared/ipc/settings'
import { options } from '../../../lib/options'
import { SettingRow } from '../../SettingsLayout'
import { isTime } from './checks'
import { NumberField, SwitchRow, TextSetting } from './fields'

/** KB/s, like qBittorrent: up to 10 GB/s */
const LIMIT_MAX = 10_000_000
const DAYS: ScheduleDays[] = ['everyday', 'weekdays', 'weekends']

/** SPEC 6 «Скорость»: the limits, the alternative ones (by hand or by the schedule) */
export function SpeedRows() {
  const { t } = useTranslation('settings')
  const scheduled = useSettings((s) => s.scheduleEnabled)
  const days = useSettings((s) => s.scheduleDays)
  const timeError = t('downloads.timeError')

  return (
    <>
      <SettingRow label={t('downloads.downloadLimit')} hint={t('downloads.limitHint')}>
        <NumberField label={t('downloads.downloadLimit')} setting="downloadLimit" max={LIMIT_MAX} />
      </SettingRow>
      <SettingRow label={t('downloads.uploadLimit')} hint={t('downloads.limitHint')}>
        <NumberField label={t('downloads.uploadLimit')} setting="uploadLimit" max={LIMIT_MAX} />
      </SettingRow>
      <SettingRow label={t('downloads.altLimits')} hint={t('downloads.altLimitsHint')}>
        <div className="flex items-center gap-2 text-fg-3">
          <IconArrowDown size={14} />
          <NumberField label={t('downloads.altDownloadLimit')} setting="altDownloadLimit" max={LIMIT_MAX} className="w-28" />
          <IconArrowUp size={14} className="ml-2" />
          <NumberField label={t('downloads.altUploadLimit')} setting="altUploadLimit" max={LIMIT_MAX} className="w-28" />
        </div>
      </SettingRow>
      <SwitchRow setting="altLimitsOn" label={t('downloads.altLimitsOn')} hint={t('downloads.altLimitsOnHint')} />
      <SwitchRow setting="scheduleEnabled" label={t('downloads.schedule')} hint={t('downloads.scheduleHint')} />
      {scheduled ? (
        <SettingRow label={t('downloads.scheduleWhen')}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TextSetting label={t('downloads.scheduleFrom')} setting="scheduleFrom" check={(v) => (isTime(v) ? null : timeError)} className="w-24" />
            <span className="text-fg-3">—</span>
            <TextSetting label={t('downloads.scheduleTo')} setting="scheduleTo" check={(v) => (isTime(v) ? null : timeError)} className="w-24" />
            <SegmentedControl
              aria-label={t('downloads.scheduleDays')}
              options={options(DAYS, (v) => t(`downloads.days.${v}`))}
              value={days}
              onChange={(value) => void updateSettings({ scheduleDays: value })}
            />
          </div>
        </SettingRow>
      ) : null}
    </>
  )
}
