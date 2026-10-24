import { Button, ConfirmDialog, Switch, TextField, useToast } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../entities/settings'
import { refreshCategories, useTorrents } from '../../../../entities/torrent'
import { CategoryList } from '../../../../features/manage-categories'
import { appIpc } from '../../../../shared/ipc/app'
import { torrentsIpc } from '../../../../shared/ipc/torrents'
import type { Settings } from '../../../../shared/ipc/settings'
import { SettingRow, SettingsSection } from '../SettingsLayout'

/** A speed limit in KB/s: stored on Enter or when the field is left */
function LimitField({ label, setting }: { label: string; setting: 'downloadLimit' | 'uploadLimit' }) {
  const stored = useSettings((s) => s[setting])
  const [text, setText] = useState(String(stored))
  useEffect(() => setText(String(stored)), [stored])
  const commit = () => {
    const value = Math.max(0, Math.floor(Number(text.replace(/\s/g, '')) || 0))
    setText(String(value))
    if (value !== stored) void updateSettings({ [setting]: value } as Partial<Settings>)
  }
  return (
    <TextField
      label={label}
      showLabel={false}
      value={text}
      onChange={setText}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      inputMode="numeric"
      mono
      className="w-40"
    />
  )
}

/** SPEC 6 «Загрузки»: what works now — folders, categories, the start, seeding, limits, behaviour (SPEC 4.6) */
export function DownloadsSection() {
  const { t } = useTranslation('settings')
  const { t: tt } = useTranslation('torrents')
  const toast = useToast()
  const custom = useSettings((s) => s.downloadsFolder)
  const startPaused = useSettings((s) => s.startPaused)
  const noSeeding = useSettings((s) => s.noSeeding)
  const closeToTray = useSettings((s) => s.closeToTray)
  const notifyFinished = useSettings((s) => s.notifyFinished)
  const keepAwake = useSettings((s) => s.keepAwakeDownloads)
  const folder = useTorrents((s) => s.downloadsFolder)
  const seeding = useTorrents((s) => s.active.filter((x) => x.state === 'seeding').length)
  const [asking, setAsking] = useState(0)

  const setFolder = async (value: string) => {
    await updateSettings({ downloadsFolder: value })
    await refreshCategories()
  }
  const pick = async () => {
    const picked = await appIpc.pickFolder(t('downloads.folder'))
    if (picked) await setFolder(picked)
  }
  const toggleNoSeeding = (on: boolean) => {
    void updateSettings({ noSeeding: on })
    // SPEC 4.3: what already seeds — only if the user agrees
    if (on && seeding) setAsking(seeding)
  }
  const archiveSeeding = async () => {
    const moved = await torrentsIpc.archiveSeeding()
    toast.show({ title: tt('toast.archivedSeeding', { count: moved }), tone: 'success' })
  }

  return (
    <SettingsSection id="downloads" title={t('downloads.title')}>
      <SettingRow label={t('downloads.folder')} hint={t('downloads.folderHint')} stacked>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-md bg-bg px-3 py-2 font-mono text-xs text-fg-2">
            {folder}
            {custom ? '' : ` · ${t('downloads.systemFolder')}`}
          </span>
          <Button variant="outline" size="sm" onPress={() => void pick()}>
            {t('downloads.change')}
          </Button>
          {custom ? (
            <Button variant="ghost" size="sm" onPress={() => void setFolder('')}>
              {t('downloads.reset')}
            </Button>
          ) : null}
        </div>
      </SettingRow>
      <SettingRow label={t('downloads.categories')} hint={t('downloads.categoriesHint')} stacked>
        <CategoryList />
      </SettingRow>
      <SettingRow label={t('downloads.startPaused')} hint={t('downloads.startPausedHint')}>
        <Switch aria-label={t('downloads.startPaused')} isSelected={startPaused} onChange={(on) => void updateSettings({ startPaused: on })} />
      </SettingRow>
      <SettingRow label={t('downloads.noSeeding')} hint={t('downloads.noSeedingHint')}>
        <Switch aria-label={t('downloads.noSeeding')} isSelected={noSeeding} onChange={toggleNoSeeding} />
      </SettingRow>
      <SettingRow label={t('downloads.downloadLimit')} hint={t('downloads.limitHint')}>
        <LimitField label={t('downloads.downloadLimit')} setting="downloadLimit" />
      </SettingRow>
      <SettingRow label={t('downloads.uploadLimit')} hint={t('downloads.limitHint')}>
        <LimitField label={t('downloads.uploadLimit')} setting="uploadLimit" />
      </SettingRow>
      <SettingRow label={t('downloads.closeToTray')} hint={t('downloads.closeToTrayHint')}>
        <Switch aria-label={t('downloads.closeToTray')} isSelected={closeToTray} onChange={(on) => void updateSettings({ closeToTray: on })} />
      </SettingRow>
      <SettingRow label={t('downloads.notifyFinished')} hint={t('downloads.notifyFinishedHint')}>
        <Switch aria-label={t('downloads.notifyFinished')} isSelected={notifyFinished} onChange={(on) => void updateSettings({ notifyFinished: on })} />
      </SettingRow>
      <SettingRow label={t('downloads.keepAwake')} hint={t('downloads.keepAwakeHint')}>
        <Switch aria-label={t('downloads.keepAwake')} isSelected={keepAwake} onChange={(on) => void updateSettings({ keepAwakeDownloads: on })} />
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
    </SettingsSection>
  )
}
