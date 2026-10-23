import { useOsd } from '../model/osd'

/** Short message in the top right corner of the video */
export function Osd() {
  const { message, seq } = useOsd()
  if (!message) return null
  return (
    <div
      key={seq}
      role="status"
      className="absolute top-[70px] right-6 z-20 animate-fade-in rounded-md border border-glass-line bg-glass px-3.5 py-2 text-sm font-medium text-fg"
    >
      {message}
    </div>
  )
}
