import { SegmentedControl, Switch } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useLibrary } from '../../../../entities/library'
import { updateSettings, useSettings } from '../../../../entities/settings'
import { ClearHistoryButton } from '../../../../features/clear-history'
import { AddFolderButton, FolderList } from '../../../../features/library-folders'
import { SettingRow, SettingsSection } from '../SettingsLayout'

const WATCHED = ['85', '90', '95'] as const

/** SPEC 6 «Библиотека и история» */
export function LibrarySection() {
  const { t } = useTranslation('settings')
  const keepHistory = useSettings((s) => s.keepHistory)
  const watched = useSettings((s) => s.watchedPercent)
  const folders = useLibrary((s) => s.folders)

  return (
    <SettingsSection id="library" title={t('library.title')}>
      <SettingRow label={t('library.history')} hint={t('library.historyHint')}>
        <Switch aria-label={t('library.history')} isSelected={keepHistory} onChange={(on) => void updateSettings({ keepHistory: on })} />
      </SettingRow>
      <SettingRow label={t('library.watched')}>
        <SegmentedControl
          aria-label={t('library.watched')}
          options={WATCHED.map((value) => ({ value, label: `${value}%` }))}
          value={String(watched)}
          onChange={(value) => void updateSettings({ watchedPercent: Number(value) })}
        />
      </SettingRow>
      <SettingRow label={t('library.folders')} hint={t('library.foldersHint')} stacked>
        {folders.length ? <FolderList folders={folders} /> : <span className="text-sm text-fg-3">{t('library.noFolders')}</span>}
        <div>
          <AddFolderButton />
        </div>
      </SettingRow>
      <SettingRow label={t('library.clear')} hint={t('library.clearHint')}>
        <ClearHistoryButton />
      </SettingRow>
    </SettingsSection>
  )
}
