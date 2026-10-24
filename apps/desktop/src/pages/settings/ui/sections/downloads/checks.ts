/** «20:30»: hours 0…23, minutes 00…59 */
export function isTime(text: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(text)
}

/** socks5://[user:password@]host:port — the only proxy the engine takes; empty — none */
export function isProxy(text: string): boolean {
  if (!text) return true
  const match = /^socks5:\/\/(?:[^@\s]+@)?([^\s:@]+|\[[^\]\s]+\]):(\d{1,5})$/.exec(text)
  return match != null && Number(match[2]) > 0 && Number(match[2]) < 65536
}

/** The lines of «Свои трекеры» that are not tracker addresses (empty lines and # notes are fine) */
export function badTrackerLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !/^(https?|udp):\/\/\S+$/.test(line))
}
