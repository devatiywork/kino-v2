const KB = 1024
const MB = KB * 1024
const GB = MB * 1024
const TB = GB * 1024

function unit(locale: string, value: number, name: string, fraction: number): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: name, maximumFractionDigits: fraction }).format(value)
}

/** «41,2 ГБ», «612 МБ», «18 КБ» — in the interface language */
export function formatSize(bytes: number, locale: string): string {
  if (bytes >= TB) return unit(locale, bytes / TB, 'terabyte', 2)
  if (bytes >= GB) return unit(locale, bytes / GB, 'gigabyte', 1)
  if (bytes >= MB) return unit(locale, bytes / MB, 'megabyte', 0)
  return unit(locale, Math.max(bytes > 0 ? 1 : 0, bytes / KB), 'kilobyte', 0)
}

/** «18,2 МБ/с», «640 кБ/с». Not Intl's «-per-second»: in Russian it writes a Latin «c» */
export function formatRate(bytesPerSecond: number, locale: string): string {
  const second = locale.startsWith('ru') ? 'с' : 's'
  const value = bytesPerSecond >= MB ? unit(locale, bytesPerSecond / MB, 'megabyte', 1) : unit(locale, bytesPerSecond / KB, 'kilobyte', 0)
  return `${value}/${second}`
}

/** A video's bitrate: «4,3 Мбит/с», «850 кбит/с» — decimal units, as bitrates are counted */
export function formatBitrate(bitsPerSecond: number, locale: string): string {
  const second = locale.startsWith('ru') ? 'с' : 's'
  const value = bitsPerSecond >= 1e6 ? unit(locale, bitsPerSecond / 1e6, 'megabit', 1) : unit(locale, bitsPerSecond / 1e3, 'kilobit', 0)
  return `${value}/${second}`
}

/** Ratio and other plain numbers with two decimals: «2,31» */
export function formatDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}
