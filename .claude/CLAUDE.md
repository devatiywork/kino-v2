# Getting Started

Before any work, complete these steps in order:

1. Read this entire file fully
2. Read all changelogs in `.claude/features/` — understand current project state and last version
3. Open the design reference `design/prototype.html` when touching UI

Do not begin any task until all steps above are complete.

# Language

All responses visible to the user — including reasoning, explanations, comments, and conclusions — must be in **Russian**. No exceptions.

# Project Overview

**Kino 2** — rewrite of the Kino desktop video player (Electron → Tauri). Windows-first.
Same functionality as Kino 1 (any format, instant audio/subtitle switching, playlist, autoplay, track memory) plus a home screen with watch history: which series, which episode, which second.

Visual direction: **«Проектор»** — warm near-black, amber accent, Unbounded + Golos Text + JetBrains Mono, logo `kin●`. Window controls on the right (Windows convention).

## Tech Stack

- Tauri 2 (Rust ≥ 1.90) — app shell, file system, single instance, file associations
- libmpv in-process via the `libmpv2` crate — rendered into a dedicated child HWND under a transparent WebView2 (spike first, fallback: external mpv.exe + JSON IPC)
- SQLite via `rusqlite` — history, positions, per-series track preferences
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
- `bun run ui` — UI library showcase on http://127.0.0.1:5180
- `bun run test` — tests in all packages
- `bun run typecheck` — TypeScript in all packages

## Architecture

```
apps/desktop/          — Tauri app (not created yet)
  src/                 — React renderer, Feature-Sliced Design (app, pages, widgets, features, entities, shared)
  src-tauri/           — Rust core: player (libmpv), library (SQLite), scanner, commands, window
packages/ui/           — @kino/ui, our UI library
  src/styles/          — tokens.css (single source of design tokens), base.css (no browser legacy), index.css
  src/icons/           — own SVG icon set, 24px grid, stroke 1.8
  src/components/      — Button, IconButton, Switch, SegmentedControl, Slider, Kbd, ScrollArea, Logo…
  src/lib/             — cn, tv, focusRing, desktopGuards
  playground/          — showcase of every component in every state
design/prototype.html  — interactive HTML prototype, the design reference
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
- Keep components under 150 lines — extract logic into hooks
- FSD layer rule: each layer imports only from layers below

## Testing

Every feature must be covered before it is considered complete:

- **Unit** — business logic in isolation (TS: Vitest; Rust: `cargo test`)
- **Integration** — IPC bridge, player service, module interactions with mocks
- **E2E** — critical user scenarios (open file, continue from history, switch track, autoplay, subtitles)

## Out of Scope

- No online streaming or YouTube/Twitch playback
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
