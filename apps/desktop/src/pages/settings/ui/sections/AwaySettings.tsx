import { Button, SegmentedControl, Switch } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../entities/settings'
import { playerIpc, type CameraCheck } from '../../../../shared/ipc/player'
import { SettingRow } from '../SettingsLayout'

const AWAY_AFTERS = [10, 20, 30, 60] as const

/** «Проверить камеру»: the camera is on for a few seconds, then what it saw */
function CameraCheckRow() {
  const { t } = useTranslation('settings')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<CameraCheck | null>(null)

  const check = async () => {
    setChecking(true)
    try {
      setResult(await playerIpc.checkCamera())
    } catch (e: unknown) {
      console.error('[settings] camera check', e)
      setResult({ kind: 'unavailable', reason: 'other' })
    } finally {
      setChecking(false)
    }
  }

  const text =
    result?.kind === 'seen'
      ? t(result.faces > 0 ? 'playback.cameraSeen' : 'playback.cameraNobody', { camera: result.camera })
      : result
        ? t(`playback.cameraUnavailable.${result.reason}`)
        : null

  return (
    <SettingRow label={t('playback.camera')} hint={t('playback.cameraHint')}>
      <div className="flex max-w-80 flex-col items-end gap-1.5 text-right">
        <Button variant="outline" size="sm" isDisabled={checking} onPress={() => void check()}>
          {checking ? t('playback.cameraChecking') : t('playback.cameraCheck')}
        </Button>
        {text ? (
          <p role="status" className={result?.kind === 'seen' && result.faces > 0 ? 'text-sm text-fg-2' : 'text-sm text-danger'}>
            {text}
          </p>
        ) : null}
      </div>
    </SettingRow>
  )
}

/** SPEC 3.1 «Пауза, когда вы отходите»: the webcam, while a video plays */
export function AwaySettings() {
  const { t } = useTranslation('settings')
  const on = useSettings((s) => s.awayPause)
  const after = useSettings((s) => s.awayAfter)
  const resume = useSettings((s) => s.awayResume)

  return (
    <>
      <SettingRow label={t('playback.away')} hint={t('playback.awayHint')}>
        <Switch aria-label={t('playback.away')} isSelected={on} onChange={(value) => void updateSettings({ awayPause: value })} />
      </SettingRow>
      <SettingRow label={t('playback.awayAfter')} hint={t('playback.awayAfterHint')}>
        <SegmentedControl
          aria-label={t('playback.awayAfter')}
          size="sm"
          isDisabled={!on}
          options={AWAY_AFTERS.map((seconds) => ({ value: String(seconds), label: t('playback.awaySeconds', { count: seconds }) }))}
          value={String(after)}
          onChange={(value) => void updateSettings({ awayAfter: Number(value) })}
        />
      </SettingRow>
      <SettingRow label={t('playback.awayResume')} hint={t('playback.awayResumeHint')}>
        <Switch
          aria-label={t('playback.awayResume')}
          isDisabled={!on}
          isSelected={resume}
          onChange={(value) => void updateSettings({ awayResume: value })}
        />
      </SettingRow>
      <CameraCheckRow />
    </>
  )
}
