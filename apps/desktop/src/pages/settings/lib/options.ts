/** Choices of a segmented control from values and their names */
export function options<T extends string>(values: readonly T[], label: (value: T) => string): { value: T; label: string }[] {
  return values.map((value) => ({ value, label: label(value) }))
}
