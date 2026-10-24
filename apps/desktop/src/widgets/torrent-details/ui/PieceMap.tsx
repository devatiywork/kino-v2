/**
 * «Скачано» as qBittorrent draws it (SPEC 4.3): the torrent's pieces from left to right, each part
 * as full as the share of its pieces on disk
 */
export function PieceMap({ parts, label }: { parts: number[]; label: string }) {
  const have = parts.length ? Math.round((parts.reduce((sum, p) => sum + p, 0) / (parts.length * 255)) * 100) : 0
  return (
    <svg
      role="img"
      aria-label={`${label}: ${have}%`}
      viewBox={`0 0 ${parts.length} 1`}
      preserveAspectRatio="none"
      className="h-2.5 w-full overflow-hidden rounded-xs bg-raise-2"
    >
      {parts.map((value, index) =>
        value ? <rect key={index} x={index} y={0} width={1.02} height={1} className="fill-accent" fillOpacity={value / 255} /> : null,
      )}
    </svg>
  )
}
