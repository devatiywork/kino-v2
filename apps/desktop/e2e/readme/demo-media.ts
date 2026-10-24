/**
 * The demo library for the README's screenshots: series and films that look like something,
 * made by ffmpeg from generated pictures (fractals, gradients, soft lights), silent sound tracks
 * (the shots set a normal volume: nothing comes out of the speakers), subtitles of our own —
 * nobody's work, nobody's rights. Titles are made up.
 *
 *   bun e2e/readme/demo-media.ts <folder>      (ffmpeg on PATH)
 *
 * A clip of 12 s is encoded once and looped without re-encoding up to the length of a real
 * episode or film: the player shows «42:00», the files stay small. About 2 GB in all.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CLIP_SECONDS = 12
const SIZE = '1280x720'

type Look = { inputs: string[]; graph: string }

/** Soft out-of-focus lights: Conway's life, blown up and blurred */
const lights = (ratio: number, color: string, trail: string, seed: number, blur: number) =>
  `life=s=160x90:rate=24:ratio=${ratio}:mold=60:life_color=${color}:death_color=#000000:mold_color=${trail}:seed=${seed},scale=${SIZE.replace('x', ':')}:flags=bicubic,gblur=sigma=${blur}`

const gradient = (colors: string[], type: string, from: [number, number], to: [number, number], seed: number) =>
  `gradients=s=${SIZE}:${colors.map((c, i) => `c${i}=${c}`).join(':')}:nb_colors=${colors.length}:type=${type}:x0=${from[0]}:y0=${from[1]}:x1=${to[0]}:y1=${to[1]}:speed=0.01:seed=${seed}`

/** A gradient with lights over it, darker at the edges */
const glow = (background: string, light: string): Look => ({
  inputs: [background, light],
  graph: '[0][1]blend=all_mode=screen,vignette=PI/4,format=yuv420p[v]',
})

const LOOKS = {
  aurora: (n: number) =>
    glow(gradient(['0x041b2d', '0x0f7a5c', n % 2 ? '0x5b2bb5' : '0x2b6cb5', '0x041021'], 'linear', [0, 720], [1280, 0], 7 + n), lights(0.05, '#5ef2b4', '#1d5e70', 4 + n, 28)),
  deep: (n: number) =>
    glow(gradient(['0x01060f', '0x053a5a', '0x0c6f8f', '0x01060f'], 'linear', [640, 0], [640 + 60 * n, 720], 11 + n), lights(0.08, '#7fe9ff', '#0a3550', 11 + n, 16)),
  sunset: (n: number) =>
    glow(gradient(['0x1a0636', '0xc2366b', '0xf6a04d', '0x120326'], 'radial', [900, 520], [200, 0], 3 + n), lights(0.03, '#ffd38a', '#5a1f3d', 9 + n, 30)),
  nebula: (n: number) =>
    glow(gradient(['0x0b0017', '0x5a1594', '0xe2508f', '0x06000e'], 'radial', [380, 300], [1280, 720], 21 + n), lights(0.06, '#ff7ac6', '#2a0b45', 21 + n, 40)),
  /** A still part of the Mandelbrot set in a film palette */
  fractal: (x: number, y: number, scale: number, palette: string): Look => ({
    inputs: [`mandelbrot=s=${SIZE}:rate=24:start_scale=${scale}:end_scale=${scale * 0.96}:start_x=${x}:start_y=${y}:maxiter=1500:outer=normalized_iteration_count:inner=black`],
    graph: `[0]format=gray,format=yuv444p,pseudocolor=preset=${palette},vignette=PI/5,format=yuv420p[v]`,
  }),
}

/** Seahorse valley, elephant valley and their neighbours: each episode a place of its own */
const FRACTAL_PLACES: [number, number, number][] = [
  [-0.7435669, 0.1314023, 0.02],
  [0.2549870, 0.0005, 0.012],
  [-0.7453, 0.1127, 0.006],
  [-1.25066, 0.02012, 0.0017],
  [-0.748, 0.1, 0.04],
  [-0.16, 1.0405, 0.026],
]

const SUBTITLES = `1
00:00:01,000 --> 00:00:05,500
Смотри — небо снова светится.

2
00:00:06,500 --> 00:00:11,000
Значит, мы пришли куда надо.
`

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

/** A 12-second clip with two dubs and Russian subtitles, then looped up to `minutes` */
function make(path: string, look: Look, minutes: number, work: string): void {
  if (existsSync(path)) return
  mkdirSync(dirname(path), { recursive: true })
  const srt = join(work, 'subtitles.srt')
  writeFileSync(srt, SUBTITLES)
  const clip = join(work, 'clip.mkv')
  const audio = ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']
  const n = look.inputs.length
  ffmpeg([
    ...look.inputs.flatMap((input) => ['-f', 'lavfi', '-i', input]),
    ...audio,
    '-i', srt,
    '-filter_complex', look.graph,
    '-map', '[v]', '-map', `${n}:a`, '-map', `${n + 1}:a`, '-map', `${n + 2}:s`,
    '-t', String(CLIP_SECONDS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '30', '-g', '48',
    '-c:a', 'aac', '-b:a', '64k', '-c:s', 'srt',
    '-metadata:s:a:0', 'language=rus', '-metadata:s:a:0', 'title=Дубляж',
    '-metadata:s:a:1', 'language=eng', '-metadata:s:a:1', 'title=Original',
    '-metadata:s:s:0', 'language=rus', '-metadata:s:s:0', 'title=Русские',
    clip,
  ])
  const loops = Math.round((minutes * 60) / CLIP_SECONDS) - 1
  ffmpeg(['-stream_loop', String(loops), '-i', clip, '-map', '0', '-c', 'copy', path])
  rmSync(clip)
}

const root = process.argv[2]
if (!root) throw new Error('usage: bun e2e/readme/demo-media.ts <folder>')
const work = join(root, '.work')
mkdirSync(work, { recursive: true })

const episode = (show: string, dots: string, season: number, ep: number) =>
  join(root, 'Сериалы', show, `Сезон ${season}`, `${dots}.S${String(season).padStart(2, '0')}E${String(ep).padStart(2, '0')}.720p.WEB-DL.mkv`)

for (let ep = 1; ep <= 8; ep++) make(episode('Северное сияние', 'Северное.сияние', 1, ep), LOOKS.aurora(ep), 42 + (ep % 3), work)
FRACTAL_PLACES.forEach(([x, y, scale], i) => make(episode('Фрактал', 'Фрактал', 1, i + 1), LOOKS.fractal(x, y, scale, i % 2 ? 'inferno' : 'magma'), 47 + (i % 4), work))
for (let ep = 1; ep <= 5; ep++) make(episode('Глубина', 'Глубина', 1, ep), LOOKS.deep(ep), 38 + (ep % 2) * 3, work)
make(join(root, 'Фильмы', 'Горизонт.2024.720p.BluRay.mkv'), LOOKS.sunset(1), 108, work)
make(join(root, 'Фильмы', 'Туманность.2023.720p.WEB-DL.mkv'), LOOKS.nebula(1), 121, work)
make(join(root, 'Фильмы', 'Кристалл.2025.720p.WEB-DL.mkv'), LOOKS.fractal(-0.1011, 0.9563, 0.004, 'viridis'), 96, work)
// The second season, seeded by another client in the README's downloads: not in the library
for (let ep = 1; ep <= 6; ep++) {
  const path = join(root, 'Раздача', 'Северное.сияние.S02.720p.WEB-DL', `Северное.сияние.S02E${String(ep).padStart(2, '0')}.720p.WEB-DL.mkv`)
  make(path, LOOKS.aurora(10 + ep), 44, work)
}
rmSync(work, { recursive: true })
console.log('demo media in', root)
