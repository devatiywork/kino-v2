import { createIcon } from './createIcon'

export { createIcon } from './createIcon'
export type { IconProps, IconComponent } from './createIcon'

const filled = { fill: 'currentColor', stroke: 'none' } as const
const tenLabel = (x: number) => (
  <text x={x} y="15.3" fontSize="6.6" fontWeight="700" textAnchor="middle" fontFamily="var(--font-mono)" {...filled}>
    10
  </text>
)

/* Воспроизведение */
export const IconPlay = createIcon('Play', <path d="M7 4.5v15l13-7.5z" {...filled} />)
export const IconPause = createIcon(
  'Pause',
  <>
    <rect x="6" y="4.5" width="4" height="15" rx="1" {...filled} />
    <rect x="14" y="4.5" width="4" height="15" rx="1" {...filled} />
  </>,
)
export const IconPrevious = createIcon(
  'Previous',
  <>
    <path d="M18 5.5v13L8.5 12z" {...filled} />
    <path d="M6 5.5v13" />
  </>,
)
export const IconNext = createIcon(
  'Next',
  <>
    <path d="M6 5.5v13l9.5-6.5z" {...filled} />
    <path d="M18 5.5v13" />
  </>,
)
export const IconBack10 = createIcon(
  'Back10',
  <>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
    <path d="M4.5 4.5v4h4" />
    {tenLabel(12.6)}
  </>,
)
export const IconForward10 = createIcon(
  'Forward10',
  <>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5" />
    <path d="M19.5 4.5v4h-4" />
    {tenLabel(11.4)}
  </>,
)
export const IconSkip = createIcon('Skip', <path d="M5 6.5l7 5.5-7 5.5zM12.5 6.5l7 5.5-7 5.5z" {...filled} />)
export const IconVolume = createIcon(
  'Volume',
  <>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
    <path d="M15.5 9a4 4 0 0 1 0 6" />
    <path d="M18.2 6.5a7.6 7.6 0 0 1 0 11" />
  </>,
)
export const IconMute = createIcon(
  'Mute',
  <>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </>,
)
export const IconSubtitles = createIcon(
  'Subtitles',
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M7 14.5h4M13 14.5h4M7 10.5h10" />
  </>,
)
export const IconEpisodes = createIcon(
  'Episodes',
  <>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.8" />
  </>,
)
export const IconPictureInPicture = createIcon(
  'PictureInPicture',
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <rect x="12" y="11" width="6.5" height="5.5" rx="1" {...filled} />
  </>,
)
export const IconFullscreen = createIcon('Fullscreen', <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />)
export const IconFullscreenExit = createIcon('FullscreenExit', <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />)
export const IconPin = createIcon(
  'Pin',
  <>
    <path d="M9 3.5h6l-1 5.5 3.5 3.5h-11L10 9z" />
    <path d="M12 12.5v8" />
  </>,
)

/* Навигация и действия */
export const IconArrowLeft = createIcon('ArrowLeft', <path d="M19 12H5M11 6l-6 6 6 6" />)
export const IconArrowRight = createIcon('ArrowRight', <path d="M5 12h14M13 6l6 6-6 6" />)
export const IconSearch = createIcon(
  'Search',
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </>,
)
export const IconFolder = createIcon(
  'Folder',
  <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />,
)
export const IconFileAdd = createIcon(
  'FileAdd',
  <>
    <path d="M13 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V9z" />
    <path d="M13 3v6h6M12 12v6M9 15h6" />
  </>,
)
export const IconSettings = createIcon(
  'Settings',
  <>
    <path d="M4 7h9M18 7h2M4 17h4M13 17h7" />
    <circle cx="15.5" cy="7" r="2.3" />
    <circle cx="10.5" cy="17" r="2.3" />
  </>,
)
export const IconCheck = createIcon('Check', <path d="M5 12.5l4.5 4.5L19 7.5" />)
export const IconPlus = createIcon('Plus', <path d="M12 5v14M5 12h14" />)
export const IconClose = createIcon('Close', <path d="M6 6l12 12M18 6L6 18" />)
export const IconUpload = createIcon(
  'Upload',
  <>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" />
  </>,
)
export const IconClock = createIcon(
  'Clock',
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
)
export const IconLayers = createIcon(
  'Layers',
  <>
    <path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" />
    <path d="M3.5 12.5L12 17l8.5-4.5" />
    <path d="M3.5 16.5L12 21l8.5-4.5" />
  </>,
)
export const IconTrash = createIcon(
  'Trash',
  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7" />,
)
export const IconLink = createIcon(
  'Link',
  <>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </>,
)
export const IconKeyboard = createIcon(
  'Keyboard',
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7.5 14h9" />
  </>,
)

/* Кнопки окна Windows: тонкие линии, как у системных */
export const IconWindowMinimize = createIcon('WindowMinimize', <path d="M5 12h14" strokeWidth="1.4" />)
export const IconWindowMaximize = createIcon(
  'WindowMaximize',
  <rect x="5" y="5" width="14" height="14" rx="1.5" strokeWidth="1.4" />,
)
export const IconWindowRestore = createIcon(
  'WindowRestore',
  <>
    <rect x="4.5" y="8" width="11.5" height="11.5" rx="1.5" strokeWidth="1.4" />
    <path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H16" strokeWidth="1.4" />
  </>,
)
export const IconWindowClose = createIcon('WindowClose', <path d="M6 6l12 12M18 6L6 18" strokeWidth="1.4" />)
