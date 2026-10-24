import { Button, Dialog, IconArchive, IconFileAdd, IconLink, IconMagnet, Modal, useToast } from '@kino/ui'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useOverlayTriggerState } from 'react-stately'
import { useSettings } from '../../../entities/settings'
import { categoryName, hostOf, shortDate, useTorrents } from '../../../entities/torrent'
import type { AddRequest, ArchiveEntry, Preview } from '../../../shared/ipc/torrents'
import { formatSize } from '../../../shared/lib/formatBytes'
import { useCoverNativeLayer } from '../../../shared/lib/nativeLayer'
import { closeAddDialog, useAddTorrent } from '../model/addTorrent'
import { confirmAdd } from '../model/confirmAdd'
import { defaultRequest, useAddForm } from '../model/useAddForm'
import { AddFormFields } from './AddFormFields'
import { FileChecklist } from './FileChecklist'

/** SPEC 4.1: what the torrent is, where it goes, which files — then «Добавить» */
export function AddTorrentDialog() {
  const { t, i18n } = useTranslation('torrents')
  const { t: tc } = useTranslation()
  const toast = useToast()
  const preview = useAddTorrent((s) => s.preview)
  const origin = useAddTorrent((s) => s.origin)
  const trackerPage = useAddTorrent((s) => s.sourceUrl)
  const categories = useTorrents((s) => s.categories)
  const showDialog = useSettings((s) => s.showAddDialog)
  const startPaused = useSettings((s) => s.startPaused)
  const form = useAddForm(preview)
  // «Окно добавления» off: a new torrent goes straight to the downloads; one the archive knows still asks
  const quick = preview != null && !showDialog && !preview.duplicate
  const state = useOverlayTriggerState({ isOpen: preview != null && !quick, onOpenChange: (open) => !open && closeAddDialog() })
  useCoverNativeLayer(preview != null && !quick)
  const locale = i18n.language
  const known = preview?.duplicate ?? null
  const locked = known != null && known.status !== 'filesDeleted'
  const request = form.request()

  const send = async (preview: Preview, request: AddRequest) => {
    try {
      const outcome = await confirmAdd(preview, request)
      const category = categoryName(request.categoryId, categories, t)
      if (outcome.kind === 'added') toast.show({ title: t(request.sourceUrl ? 'toast.addedWithSource' : 'toast.added', { category }), tone: 'success' })
      if (outcome.kind === 'again') toast.show({ title: t('toast.downloadAgain', { name: preview.name }), tone: 'success' })
    } catch (e: unknown) {
      console.error('[torrents] add', e)
      toast.show({ title: String(e), tone: 'danger', duration: 6000 })
    }
  }
  const submit = () => (preview && request ? send(preview, request) : Promise.resolve())

  useEffect(() => {
    if (quick && preview) void send(preview, defaultRequest(preview, trackerPage, startPaused))
    // Once per torrent: `send` and the settings are read as they are at that moment
  }, [quick, preview])

  const confirmLabel = !known
    ? t('add.confirm')
    : known.status === 'inDownloads'
      ? t('add.openInDownloads')
      : known.status === 'onDisk'
        ? t('add.showInArchive')
        : t('add.downloadAgain')

  return (
    <Modal state={state}>
      <Dialog
        title={known ? t('add.titleDuplicate') : t('add.title')}
        className="w-[880px]"
        actions={
          <>
            <span className="mr-auto flex items-center gap-2 self-center text-sm text-fg-3">
              <IconArchive size={15} />
              {t('add.hint')}
            </span>
            <Button variant="secondary" onPress={state.close}>
              {tc('actions.cancel')}
            </Button>
            <Button variant="primary" isDisabled={!locked && !request} onPress={() => void submit()}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        {preview ? (
          <div className="flex flex-col gap-4 pt-1">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs text-fg-3">
                {origin === 'tracker' ? <IconLink size={13} /> : origin === 'magnet' ? <IconMagnet size={13} /> : <IconFileAdd size={13} />}
                {origin === 'tracker'
                  ? t('add.fromTracker', { host: hostOf(trackerPage ?? '') })
                  : origin === 'magnet'
                    ? t('add.fromMagnet')
                    : t('add.fromFile')}
              </span>
              <b className="truncate text-md font-semibold text-fg">{preview.name}</b>
              <span className="font-mono text-xs text-fg-3">
                {t('add.meta', {
                  size: formatSize(preview.totalSize, locale),
                  files: t('files', { count: preview.files.length }),
                  hash: `${preview.infoHash.slice(0, 8)}…${preview.infoHash.slice(-4)}`,
                })}
              </span>
            </div>
            {known ? <KnownBanner entry={known} category={categoryName(known.categoryId, categories, t)} date={shortDate(known.addedAt, locale)} /> : null}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-5">
              <AddFormFields form={form} isDisabled={locked} />
              <FileChecklist files={preview.files} selected={form.selected} onChange={form.setSelected} isDisabled={locked} />
            </div>
            {!locked && !form.selected.size ? <p className="text-sm text-danger">{t('add.noFiles')}</p> : null}
          </div>
        ) : null}
      </Dialog>
    </Modal>
  )
}

/** «Уже в архиве · Сериалы · добавлен 2 мар. 2026 · файлы удалены. Можно скачать снова…» */
function KnownBanner({ entry, category, date }: { entry: ArchiveEntry; category: string; date: string }) {
  const { t } = useTranslation('torrents')
  const next =
    entry.status === 'inDownloads' ? t('add.duplicateActive') : entry.status === 'filesDeleted' ? t('add.duplicateDeleted') : t('add.duplicateOnDisk', { folder: entry.contentPath })
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-md border border-accent/40 bg-accent-soft px-3 py-2.5 text-sm text-fg">
      <IconArchive size={18} className="mt-px shrink-0 text-accent-fg" />
      <span>
        {t('add.duplicate', { category, date, status: t(`archiveState.${entry.status}`).toLowerCase() })} {next}
      </span>
    </div>
  )
}
