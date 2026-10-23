/** Time under the pointer on a horizontal bar, clamped to [0, duration] */
export function pointerTime(clientX: number, rect: { left: number; width: number }, duration: number): number {
  if (rect.width <= 0 || duration <= 0) return 0
  const ratio = (clientX - rect.left) / rect.width
  return Math.min(1, Math.max(0, ratio)) * duration
}
