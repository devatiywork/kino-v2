# Getting Started

Before any work, complete these steps in order:

1. Read this entire file fully
2. Read `.claude/SPEC.md` — what the app must do (section 9 lists proposals that are NOT approved yet)
3. Read all changelogs in `.claude/features/` — understand current project state and last version
4. Open the design reference `design/prototype.html` when touching UI

Do not begin any task until all steps above are complete.

# Language

All responses visible to the user — including reasoning, explanations, comments, and conclusions — must be in **Russian**. No exceptions.

# Project Overview

**Kino 2** — rewrite of the Kino desktop video player (Electron → Tauri). Windows-first.
**Personal project for one user, not distributed.** Third-party license compatibility (GPL/LGPL builds of mpv, GPL tracker definitions, etc.) is not a constraint when choosing libraries.

One window, two independent modules:

- **Player** — same functionality as Kino 1 (any format, instant audio/subtitle switching, playlist, autoplay, track memory) plus a home screen with watch history: which series, which episode, which second.
- **Torrents** — a general-purpose BitTorrent client (series, games, programs — anything) with a **permanent archive** of every torrent ever added, grouped by user categories, so anything can be downloaded again in one click.

The player never depends on the torrent module. The only link is optional: "this video file came from that torrent". See `.claude/SPEC.md`.

Visual direction: **«Проектор»** — warm near-black, amber accent, Unbounded + Golos Text + JetBrains Mono, logo `kin●`. Window controls on the right (Windows convention).
Themes: dark (default), light, system. The video area and controls over video are always dark (`data-theme="dark"` scope).

## Tech Stack

- Tauri 2 (Rust ≥ 1.90) — app shell, file system, single instance, file associations
- libmpv in-process via the `libmpv2` crate — rendered into a dedicated child HWND under a transparent WebView2. Confirmed by `spikes/tauri-mpv` (see its README for the recipe: opaque window + `backgroundColor: #00000000`, video host at `HWND_BOTTOM` without `WS_CLIPSIBLINGS`). libmpv comes from shinchiro/mpv-winbuild-cmake via `scripts/fetch-libmpv.ps1` into `vendor/libmpv` (not committed)
- `librqbit` — BitTorrent engine in the Rust core (torrent module)
- Trackers window — a separate, isolated WebView (no IPC capabilities) with a persistent profile; `.torrent` downloads and `magnet:` navigations are intercepted on the Rust side and turned into the "add torrent" flow
- SQLite via `rusqlite` — two independent schemas: player (library, positions, history, track preferences) and torrents (categories, archive with `.torrent` blobs, files, download state)
- Tauri plugins: single-instance, deep-link (`magnet:`), file associations (`.torrent`, video), tray, notifications
- React 19 + TypeScript 7 + Vite 8
- Tailwind CSS v4 — only through design tokens, default palette disabled
- react-aria / react-stately — accessible behavior for our own components (no native widgets)
- tailwind-variants + tailwind-merge — component variants
- i18next — Russian, English
- Vitest 5 + Testing Library — unit and integration tests
- Playwright via CDP to WebView2 — E2E
- Bun workspaces — package manager and scripts (never npm/npx)

## Commands

- `bun install` — install dependencies
- `bun run dev` — the app in dev mode (Vite on http://127.0.0.1:5181 + Tauri/Rust core)
- `bun run ui` — UI library showcase on http://127.0.0.1:5180
- `bun run test` — tests in all packages
- `bun run typecheck` — TypeScript in all packages
- `powershell -ExecutionPolicy Bypass -File scripts/fetch-libmpv.ps1` — download libmpv into `vendor/libmpv` and generate `mpv.lib` (needs 7-Zip and VS Build Tools)
- `cargo run --manifest-path spikes/tauri-mpv/src-tauri/Cargo.toml -- <video>` — the libmpv + WebView2 spike

## Architecture

```
apps/desktop/          — Tauri app (@kino/desktop)
  src/                 — React renderer, Feature-Sliced Design:
    app/               — entry (main.tsx), App (screen switch, drop overlay), startup sync and notices, styles
    pages/             — home (hero + history + unfinished; Welcome when empty), history, player
                         (+ useVideoLayer, useSubtitleLift, ResumeBanner), placeholder
    widgets/           — app-title-bar, player-chrome, continue-hero, continue-grid, history-list
    features/          — open-video, seek, volume, switch-tracks, playback-speed, fullscreen, player-hotkeys
    entities/          — playback (store mirrored from the core, actions, OSD, resume, track labels),
                         library (continue/history store, labels, day grouping, Thumb, ContinueCard, HistoryRow), app-window
    shared/            — ipc/ (bridge.ts — the only Tauri import for commands/events; typed wrappers: player, library,
                         window, app), lib/ (store, router, media, time), i18n/ (ru, en: common, player, library)
    test/              — Vitest setup, Tauri bridge mock (mock shared/ipc/bridge), track and library fixtures
  src-tauri/           — Rust core:
    src/db.rs          — one SQLite file, migrations by PRAGMA user_version; player tables `player_*`, torrent tables `torrent_*`
    src/library/       — Library (positions, viewings, continue watching, history, track memory per series),
                         episode (S02E05 / 2x05 / «Серия 5» → series key), track_pref (match by language and title), commands
    src/player/        — Player (libmpv), video_host (child HWND), events (mpv event thread → player://state,
                         player://position, player://notice; registers files, applies track memory), session (saves the
                         position, takes frames), state (snapshot, pure + tested), tracks (track-list parsing), commands
    later              — scanner, torrent (librqbit, archive, categories), trackers (isolated webview,
                         download/magnet interception), tray
  data                 — %APPDATA%\local.kino.app: kino.db, thumbs\<file id>.jpg (served to the page by the asset protocol)
packages/ui/           — @kino/ui, our UI library
  src/styles/          — tokens.css (single source of design tokens, dark + light), base.css (no browser legacy), index.css
  src/icons/           — own SVG icon set, 24px grid, stroke 1.8
  src/components/      — Button, IconButton, Pressable, Switch, SegmentedControl, Slider, Select, ListBox, Popover, PopoverButton, Kbd,
                         ScrollArea, Logo, TitleBar, TitleBarNav, WindowControls, SearchField, Tabs, Tooltip (useTooltipFor),
                         MenuButton, ContextMenu, Dialog/Modal, ConfirmDialog, ToastProvider/useToast
  src/lib/             — cn, tv, focusRing, desktopGuards, theme (applyTheme, applyAccent), usePresence
  playground/          — showcase of every component in every state
design/prototype.html  — interactive HTML prototype, the design reference
spikes/tauri-mpv/      — throwaway spike: libmpv in a child HWND under a transparent WebView2 (README = findings)
scripts/               — fetch-libmpv.ps1
vendor/libmpv/         — libmpv-2.dll, mpv.lib, headers (gitignored, produced by the script)
.cargo/config.toml     — network retries for crates.io
```

## UI Library Rules (@kino/ui)

- Every UI element of the app comes from `@kino/ui`. No raw `<button>`, `<input>`, `<select>` in the app.
- No browser legacy:
  - no native `select`, `input[type=range|checkbox|radio]` visuals — own components on react-aria
  - no `alert` / `confirm` / `prompt` — own Dialog / inline confirm
  - no `title` tooltips — own Tooltip
  - no system context menu — own ContextMenu; system one only in text fields
  - no native scrollbars — `ScrollArea`
  - no browser focus outline — focus ring via `data-focus-visible`, keyboard only
  - no text selection on UI chrome, no image/link dragging, no pointer cursor on buttons
  - no browser shortcuts (F5, Ctrl+R/P/F/U/S/N, zoom) — `installDesktopGuards()` in the app entry
  - fonts are bundled (fontsource), no network requests
- Colors, fonts, text sizes, radii, shadows, easings — only tokens from `tokens.css`. Never hardcode colors.
- Every color token exists in both themes (`--kino-*` under `[data-theme='dark']` and `[data-theme='light']`); check contrast ≥ 4.5:1 in both.
- Every overlay (Select, menus, popovers) has its open state shown in the showcase and animates in (180 ms) and out (150 ms).
- Interaction via `onPress` (react-aria), state via `data-*` attributes (`data-hovered`, `data-pressed`, `data-selected`, `data-focus-visible`, `data-disabled`).
- Every component: variants via `tv`, accepts `className`, has tests and a showcase entry.

## Code Style

- Bun as package manager and runtime — never use npm or npx
- Functional React components only, named exports only
- Async/await over Promise chains
- No `any` in TypeScript — use `unknown` with type guards
- No empty catch blocks — always log or rethrow
- IPC calls only through `apps/desktop/src/shared/ipc/` — typed wrappers over Tauri commands
- Track/subtitle switching via mpv properties — never reload video
- Never carry a track index between files — match by language and title only
- Remote pages (trackers) never get Tauri IPC access: capabilities are granted to the main window only
- Player and torrent modules do not import each other; they meet only in the app layer and through the optional file↔torrent link
- A torrent record is never lost implicitly: removing from downloads or deleting files keeps the archive entry; only "delete from archive" removes it, with confirmation
- Keep components under 150 lines — extract logic into hooks
- FSD layer rule: each layer imports only from layers below

## Testing

Every feature must be covered before it is considered complete:

- **Unit** — business logic in isolation (TS: Vitest; Rust: `cargo test`)
- **Integration** — IPC bridge, player service, module interactions with mocks
- **E2E** — critical user scenarios (open file, continue from history, switch track, autoplay, subtitles; add torrent with category, remove from downloads keeps archive, download again)

## Out of Scope

- No online streaming or YouTube/Twitch playback
- No background scraping of tracker sites and no bypassing their protection (captcha, Cloudflare, bot detection) — trackers are used only through the built-in trackers window, where the user browses and solves any captcha themselves
- No built-in codec or driver installation
- No cloud sync or remote libraries
- No mobile or web builds — desktop only
- No telemetry, analytics, or crash reporting
- No DRM-protected content playback
- No video editing or conversion features

## Workflow

After every change to the project:

1. Bump version in the root `package.json` (semver: patch for fixes, minor for features)
2. Create or update `.claude/features/v{version}.md` with a detailed description of changes
3. Commit with a detailed message describing exactly what was changed and why
4. Push to remote (once the GitHub repository is connected)

### `.claude/features/v{version}.md` format:

**Date:** 2026-10-23

### Added

- …

### Changed

- …

### Fixed

- …

## Keeping This File Up to Date

Update **Architecture**, **Tech Stack** and **Commands** when they change.
Do NOT put code changes or feature descriptions here — they belong in `.claude/features/v{version}.md`.
