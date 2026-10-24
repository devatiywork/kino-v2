import { Button, Switch, TextField } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../../entities/settings'
import { appIpc } from '../../../../../shared/ipc/app'
import type { Settings } from '../../../../../shared/ipc/settings'
import { SettingRow } from '../../SettingsLayout'

type Flag = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]
type Count = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings]
type Text = { [K in keyof Settings]: Settings[K] extends string ? K : never }[keyof Settings]

/** A switch row bound to one setting: applied at once */
export function SwitchRow({ setting, label, hint }: { setting: Flag; label: string; hint?: string }) {
  const on = useSettings((s) => s[setting])
  return (
    <SettingRow label={label} hint={hint}>
      <Switch aria-label={label} isSelected={on} onChange={(value) => void updateSettings({ [setting]: value } as Partial<Settings>)} />
    </SettingRow>
  )
}

interface NumberFieldProps {
  label: string
  setting: Count
  max?: number
  /** Two digits after the point: a ratio */
  decimal?: boolean
  isDisabled?: boolean
  className?: string
}

/** A number (KB/s, a count, minutes, a ratio): stored on Enter or when the field is left */
export function NumberField({ label, setting, max, decimal, isDisabled, className = 'w-40' }: NumberFieldProps) {
  const stored = useSettings((s) => s[setting])
  const [text, setText] = useState(String(stored))
  useEffect(() => setText(String(stored)), [stored])
  const commit = () => {
    const typed = Number(text.replace(/\s/g, '').replace(',', '.')) || 0
    const value = Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(0, decimal ? Math.round(typed * 100) / 100 : Math.floor(typed)))
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
      inputMode={decimal ? 'decimal' : 'numeric'}
      isDisabled={isDisabled}
      mono
      className={className}
    />
  )
}

interface TextSettingProps {
  label: string
  setting: Text
  /** What is wrong with the text, or null when it can be stored */
  check?: (text: string) => string | null
  multiline?: boolean
  placeholder?: string
  isDisabled?: boolean
  className?: string
}

/** A text setting (a time, a proxy, the trackers): stored when the field is left, if it is right */
export function TextSetting({ label, setting, check, multiline, placeholder, isDisabled, className }: TextSettingProps) {
  const stored = useSettings((s) => s[setting])
  const [text, setText] = useState(stored)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setText(stored), [stored])
  const commit = () => {
    const value = text.trim()
    const problem = check?.(value) ?? null
    setError(problem)
    if (!problem && value !== stored) void updateSettings({ [setting]: value } as Partial<Settings>)
  }
  return (
    <TextField
      label={label}
      showLabel={false}
      value={text}
      onChange={(value) => {
        setText(value)
        setError(null)
      }}
      onBlur={commit}
      onKeyDown={(e) => !multiline && e.key === 'Enter' && commit()}
      isInvalid={error != null}
      errorMessage={error ?? undefined}
      multiline={multiline}
      placeholder={placeholder}
      isDisabled={isDisabled}
      mono
      className={className}
    />
  )
}

/** A folder setting: the path, «Изменить…» (the system picker) and «Сбросить» back to `empty` */
export function FolderField({ setting, title, empty, onChanged }: { setting: Text; title: string; empty: string; onChanged?: () => Promise<void> }) {
  const { t } = useTranslation('settings')
  const value = useSettings((s) => s[setting])
  const set = async (folder: string) => {
    await updateSettings({ [setting]: folder } as Partial<Settings>)
    await onChanged?.()
  }
  const pick = async () => {
    const picked = await appIpc.pickFolder(title)
    if (picked) await set(picked)
  }
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate rounded-md bg-bg px-3 py-2 font-mono text-xs text-fg-2">{value || empty}</span>
      <Button variant="outline" size="sm" onPress={() => void pick().catch((e: unknown) => console.error('[settings] folder', e))}>
        {t('downloads.change')}
      </Button>
      {value ? (
        <Button variant="ghost" size="sm" onPress={() => void set('').catch((e: unknown) => console.error('[settings] folder', e))}>
          {t('downloads.reset')}
        </Button>
      ) : null}
    </div>
  )
}
