import { SegmentedControl } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { updateSettings, useSettings } from '../../../../../entities/settings'
import type { TorrentProtocol } from '../../../../../shared/ipc/settings'
import { options } from '../../../lib/options'
import { SettingRow } from '../../SettingsLayout'
import { isProxy } from './checks'
import { NumberField, SwitchRow, TextSetting } from './fields'

const PROTOCOLS: TorrentProtocol[] = ['tcpAndUtp', 'tcp', 'utp']

/** SPEC 6 «Соединение» and the peer sources: the engine reads them when Kino starts */
export function ConnectionRows() {
  const { t } = useTranslation('settings')
  const protocol = useSettings((s) => s.protocol)

  return (
    <>
      <SettingRow label={t('downloads.port')} hint={t('downloads.portHint')}>
        <NumberField label={t('downloads.port')} setting="listenPort" max={65_535} className="w-28" />
      </SettingRow>
      <SwitchRow setting="upnp" label={t('downloads.upnp')} hint={t('downloads.upnpHint')} />
      <SettingRow label={t('downloads.protocol')}>
        <SegmentedControl
          aria-label={t('downloads.protocol')}
          options={options(PROTOCOLS, (v) => t(`downloads.protocols.${v}`))}
          value={protocol}
          onChange={(value) => void updateSettings({ protocol: value })}
        />
      </SettingRow>
      <SettingRow label={t('downloads.peerLimit')} hint={t('downloads.peerLimitHint')}>
        <NumberField label={t('downloads.peerLimit')} setting="peerLimit" max={2_000} className="w-28" />
      </SettingRow>
      <SettingRow label={t('downloads.proxy')} hint={t('downloads.proxyHint')} stacked>
        <TextSetting
          label={t('downloads.proxy')}
          setting="proxy"
          placeholder="socks5://127.0.0.1:1080"
          check={(v) => (isProxy(v) ? null : t('downloads.proxyError'))}
        />
      </SettingRow>
      <SwitchRow setting="dht" label={t('downloads.dht')} hint={t('downloads.dhtHint')} />
      <SwitchRow setting="lsd" label={t('downloads.lsd')} hint={t('downloads.lsdHint')} />
    </>
  )
}
