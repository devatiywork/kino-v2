import { Button, IconPlus, SegmentedControl, Switch, TextField } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CategoryDialog, useTorrents } from '../../../entities/torrent'
import { appIpc } from '../../../shared/ipc/app'
import type { useAddForm } from '../model/useAddForm'

type Form = ReturnType<typeof useAddForm>

const NONE = 'none'

/** The left column of the add dialog: category, folder, release page, «Начать сразу» */
export function AddFormFields({ form, isDisabled }: { form: Form; isDisabled?: boolean }) {
  const { t } = useTranslation('torrents')
  const categories = useTorrents((s) => s.categories)
  const [creating, setCreating] = useState(false)
  const options = [...categories.map((c) => ({ value: String(c.id), label: c.name })), { value: NONE, label: t('noCategory') }]

  const browse = async () => {
    const picked = await appIpc.pickFolder(t('add.folder'))
    if (picked) form.editFolder(picked)
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span id="add-category" className="text-sm font-medium text-fg-2">
          {t('add.category')}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-labelledby="add-category"
            options={options}
            value={form.categoryId == null ? NONE : String(form.categoryId)}
            onChange={(value) => form.chooseCategory(value === NONE ? null : Number(value))}
            isDisabled={isDisabled}
            className="flex-wrap"
          />
          <Button variant="ghost" size="sm" icon={<IconPlus size={14} />} isDisabled={isDisabled} onPress={() => setCreating(true)}>
            {t('newCategory')}
          </Button>
        </div>
      </div>
      <TextField
        label={t('add.folder')}
        value={form.folder}
        onChange={form.editFolder}
        isDisabled={isDisabled}
        mono
        addon={
          <Button variant="ghost" size="sm" isDisabled={isDisabled} onPress={() => void browse()}>
            {t('add.browse')}
          </Button>
        }
      />
      <TextField
        label={t('add.source')}
        value={form.source}
        onChange={form.setSource}
        placeholder="https://…"
        description={t('add.sourceHint')}
        isDisabled={isDisabled}
        mono
      />
      <div className="flex items-center justify-between gap-3 rounded-md bg-hover px-3 py-2.5">
        <span className="text-base text-fg">{t('add.start')}</span>
        <Switch aria-label={t('add.start')} isSelected={form.start} onChange={form.setStart} isDisabled={isDisabled} />
      </div>
      <CategoryDialog isOpen={creating} onOpenChange={setCreating} category={null} onSaved={(id) => form.chooseCategory(id)} />
    </div>
  )
}
