import { Kbd, KeyRecorder, useToast, type RecordedKey } from '@kino/ui'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { keyLabel, PLAYER_ACTIONS, rebind, resolveHotkeys, updateSettings, useSettings, type RebindableAction } from '../../../entities/settings'

/**
 * SPEC 6 «Горячие клавиши»: a table, a click on a key and a new key press. A key taken by
 * another action swaps with it, so no action is left without a key
 */
export function HotkeyTable() {
  const { t } = useTranslation('settings')
  const toast = useToast()
  const overrides = useSettings((s) => s.hotkeys)
  const hotkeys = useMemo(() => resolveHotkeys(overrides), [overrides])
  const label = (code: string) => keyLabel(code, t('hotkeys.space'))
  const actionName = (action: RebindableAction) => t(`hotkeys.actions.${action}`)

  const record = (action: RebindableAction, key: RecordedKey) => {
    const result = rebind(overrides, action, key)
    if (!result.ok) {
      toast.show({ title: t(`hotkeys.${result.reason}`, { key: label(key.code) }), tone: 'warning', duration: 5000 })
      return
    }
    void updateSettings({ hotkeys: result.overrides })
    if (result.swapped) {
      const other = actionName(result.swapped)
      toast.show({ title: t('hotkeys.swapped', { key: label(key.code), action: actionName(action), other, old: label(hotkeys[action]) }), duration: 6000 })
    }
  }

  return (
    <table className="w-full border-collapse text-base">
      <tbody>
        {PLAYER_ACTIONS.map((action) => (
          <tr key={action} className="border-t border-line first:border-t-0">
            <td className="py-2 pl-[18px] text-fg">{actionName(action)}</td>
            <td className="py-2 pr-[18px] text-right">
              <KeyRecorder
                aria-label={t('hotkeys.recordLabel', { action: actionName(action), key: label(hotkeys[action]) })}
                listeningLabel={t('hotkeys.listening')}
                onRecord={(key) => record(action, key)}
              >
                {label(hotkeys[action])}
              </KeyRecorder>
            </td>
          </tr>
        ))}
        <tr className="border-t border-line">
          <td className="py-2.5 pl-[18px] text-fg-2">{t('hotkeys.actions.exitFullscreen')}</td>
          <td className="py-2.5 pr-[18px] text-right">
            <span className="mr-3 text-sm text-fg-3">{t('hotkeys.fixed')}</span>
            <Kbd>Esc</Kbd>
          </td>
        </tr>
      </tbody>
    </table>
  )
}
