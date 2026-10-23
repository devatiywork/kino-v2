import type { Track } from '../../../shared/ipc/player'

/** ISO 639-2 codes from containers → BCP 47 for Intl.DisplayNames */
const LANG_639_2: Record<string, string> = {
  rus: 'ru', eng: 'en', ukr: 'uk', jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', ger: 'de', deu: 'de',
  fre: 'fr', fra: 'fr', spa: 'es', ita: 'it', por: 'pt', pol: 'pl', cze: 'cs', ces: 'cs', tur: 'tr',
  ara: 'ar', heb: 'he', hin: 'hi', tha: 'th', vie: 'vi', swe: 'sv', fin: 'fi', nor: 'no', dan: 'da',
  dut: 'nl', nld: 'nl', hun: 'hu', gre: 'el', ell: 'el', bul: 'bg', srp: 'sr', hrv: 'hr', kaz: 'kk', bel: 'be',
}

const CODECS: Record<string, string> = {
  ac3: 'AC3', eac3: 'E-AC3', dts: 'DTS', truehd: 'TrueHD', aac: 'AAC', mp3: 'MP3', flac: 'FLAC', opus: 'Opus',
  vorbis: 'Vorbis', pcm_s16le: 'PCM', pcm_s24le: 'PCM', subrip: 'SRT', ass: 'ASS', ssa: 'SSA', webvtt: 'WebVTT',
  hdmv_pgs_subtitle: 'PGS', dvd_subtitle: 'VobSub', mov_text: 'MOV',
}

const CHANNELS: Record<number, string> = { 1: '1.0', 2: '2.0', 3: '2.1', 6: '5.1', 7: '6.1', 8: '7.1' }

/** "русский", "English" — the language name in the interface language; null if unknown */
export function languageName(code: string | null, locale: string): string | null {
  if (!code || code === 'und') return null
  const tag = LANG_639_2[code.toLowerCase()] ?? code
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(tag)
    if (!name || name.toLowerCase() === tag.toLowerCase()) return code.toUpperCase()
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
  } catch {
    return code.toUpperCase()
  }
}

/** Main line of a track: its title from the file, otherwise the language */
export function trackTitle(track: Track, locale: string, fallback: string): string {
  return track.title ?? languageName(track.lang, locale) ?? fallback
}

/** Second line: language, codec and channels — "RU · AC3 5.1" */
export function trackDetails(track: Track): string {
  const lang = track.lang && track.lang !== 'und' ? (LANG_639_2[track.lang.toLowerCase()] ?? track.lang).toUpperCase() : null
  const codec = track.codec ? (CODECS[track.codec] ?? track.codec.toUpperCase()) : null
  const channels = track.channels ? (CHANNELS[track.channels] ?? `${track.channels}ch`) : null
  return [lang, [codec, channels].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
}
