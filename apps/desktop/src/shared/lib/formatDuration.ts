/** «2 ч 5 мин», «12 мин», «40 с» — for what is left, in the interface language */
export function formatDuration(seconds: number, locale: string): string {
  const unit = (value: number, name: string) => new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(value)
  const total = Math.max(0, Math.round(seconds))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days) return `${unit(days, 'day')} ${unit(hours, 'hour')}`
  if (hours) return `${unit(hours, 'hour')} ${unit(minutes, 'minute')}`
  if (minutes) return unit(minutes, 'minute')
  return unit(total, 'second')
}
