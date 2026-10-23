import { showOsd } from '../../../entities/playback'
import { settingsStore, updateSettings } from '../../../entities/settings'
import { i18n } from '../../../shared/i18n'

/** The switch of the episodes panel: the same setting as on the settings screen */
export async function toggleAutoplay(): Promise<void> {
  const enabled = !settingsStore.get().autoplay
  showOsd(i18n.t(enabled ? 'osd.autoplayOn' : 'osd.autoplayOff', { ns: 'player' }))
  await updateSettings({ autoplay: enabled })
}
