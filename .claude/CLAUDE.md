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

Visual direction: **«Проектор»** — warm graphite dark theme (not near-black: easy on OLED), amber accent, Unbounded + Golos Text + JetBrains Mono, logo `kin●`. Window controls on the right (Windows convention).
Themes: dark (default), light, system. The video area and controls over video are always dark (`data-theme="dark"` scope).

## Tech Stack

- Tauri 2 (Rust ≥ 1.90) — app shell, file system, single instance, file associations
- libmpv in-process via the `libmpv2` crate — rendered into a dedicated child HWND under a transparent WebView2. Confirmed by `spikes/tauri-mpv` (see its README for the recipe: opaque window + `backgroundColor: #00000000`, video host at `HWND_BOTTOM` without `WS_CLIPSIBLINGS`). libmpv comes from shinchiro/mpv-winbuild-cmake via `scripts/fetch-libmpv.ps1` into `vendor/libmpv` (not committed)
- `librqbit` 9 — BitTorrent engine in the Rust core (torrent module), with fast resume; TLS through Windows' schannel
- Trackers browser — a child webview of the main window (`window.add_child`, Tauri feature `unstable`), laid over the «Трекеры» tab by bounds the renderer reports; a remote origin gets no Tauri IPC (no `remote.urls` in the capabilities). It shares the main WebView2 profile, so logins persist. `.torrent` downloads (`on_download`) and `magnet:` navigations (`on_navigation`) are turned into the "add torrent" flow on the Rust side; any other web page, of any site, stays inside (new windows open in place), nothing goes to the default browser by itself. Back / forward use WebView2's own history (`webview2-com`, the version wry is built on, through `with_webview`)
- SQLite via `rusqlite` — two independent schemas: player (library, positions, history, track preferences) and torrents (categories, archive records, files, download state); the archive's `.torrent` files lie in `<data>\torrents\files`
- Tauri plugins: dialog, notification (`tauri-plugin-notification`); the tray through Tauri's `tray-icon` feature. Planned: single-instance, deep-link (`magnet:`), file associations (`.torrent`, video)
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
- `bun run e2e` — E2E tests: builds the debug core, starts Vite, drives the real app through Playwright (needs `vendor/libmpv`)
- `bun run --filter @kino/desktop build` — release build and the installer: `apps/desktop/src-tauri/target/release/bundle/nsis/Kino_<version>_x64-setup.exe`
  (per user, no admin; libmpv next to the exe, file associations, `magnet:`, Kino in Windows' «Приложения по умолчанию»)
- `powershell -ExecutionPolicy Bypass -File apps/desktop/e2e/fixtures/make-media.ps1 -Mpv <mpv.exe>` — regenerate the test clips (committed; rerun only to change them)
- `bun scripts/fetch-filters.ts` — refresh the ad blocker's list (RU AdList + EasyList) in `apps/desktop/src-tauri/filters/` before a release
- `bun scripts/make-icons.ts` — Kino's icon from `apps/desktop/src-tauri/icons/source/*.svg`: icon.ico (16–32 px from icon-small.svg, 48–256 px from icon.svg) and icon.png
- `powershell -ExecutionPolicy Bypass -File scripts/fetch-libmpv.ps1` — download libmpv into `vendor/libmpv` and generate `mpv.lib` (needs 7-Zip and VS Build Tools)
- `cargo run --manifest-path spikes/tauri-mpv/src-tauri/Cargo.toml -- <video>` — the libmpv + WebView2 spike

## Architecture

```
apps/desktop/          — Tauri app (@kino/desktop)
  src/                 — React renderer, Feature-Sliced Design:
    app/               — entry (main.tsx: settings loaded before the first render), App (screen switch, drop overlay),
                         startup sync and notices, appearance (theme, accent, language follow the settings), styles
    pages/             — home (hero + history + unfinished + series; Welcome when empty), history, series (list + folders),
                         show (one series), player (+ useVideoLayer, useSubtitleLift, usePanelMargin, ResumeBanner),
                         settings (side menu with scroll spy, sections: appearance, playback, tracks, library, downloads,
                         hotkeys, system; downloads/ — groups by qBittorrent's: SpeedRows, SeedingRows, ConnectionRows,
                         fields bound to one setting (SwitchRow, NumberField, TextSetting with a check, FolderField),
                         checks — time, proxy, tracker lines), downloads (tabs «Загрузки» / «Архив» / «Трекеры», speeds,
                         category bar, details panel, Ctrl V with a magnet link), placeholder
    widgets/           — app-title-bar (a `search` slot the app fills), global-search (Ctrl K: series, played files,
                         the torrent archive in one SearchCombo), player-chrome (top bar, bottom controls, EpisodesPanel), continue-hero, continue-grid,
                         history-list, series-grid, series-hero, episode-list, downloads-list (rows + «Смотреть»),
                         torrent-details (General with the piece map / Files / Peers with speeds / Trackers with DHT, PeX,
                         LSD and re-announce / Speed chart 1-5-30 min / Options: seeding, check, move, save .torrent;
                         polled every second, resizable),
                         archive-list (search, category, «Когда добавлен», sort, month groups, the backup menu), trackers-pane (bookmarks + browser bar + the place the
                         native page is laid over: useTrackerLayout sends its bounds, hides it when covered or left)
    features/          — open-video, library-folders, seek, volume, switch-tracks, playback-speed, fullscreen, player-hotkeys,
                         toggle-autoplay, rebind-hotkey (HotkeyTable), clear-history, reset-settings,
                         add-torrent (AddTorrentDialog, MagnetDialog, header buttons; duplicates → the archive record),
                         torrent-actions (pause, menu, delete with files; the menu also on a right click — useTorrentMenu;
                         AltLimitsButton — the alternative limits on / off),
                         archive-actions (download / seed again, delete record; right click — useArchiveMenu), manage-categories (CategoryBar with right-click edit, CategoryList for the settings),
                         manage-bookmarks (BookmarkList with the «…» menu: edit, move, delete; BookmarkDialog),
                         free-season («Освободить место» of a watched season), download-series-again (episodes gone from
                         the disk whose torrent is in the archive: «Скачать снова»), archive-backup (save the archive to a
                         file, restore from one)
    entities/          — playback (store mirrored from the core, actions, episodes (N/P, autoplay), OSD, resume, track labels),
                         settings (store mirrored from the core, optimistic updateSettings, hotkeys: actions, defaults,
                         rebind with swap, key labels, useHotkeyLabel),
                         library (store: continue/history/series/folders, useSeriesDetail, labels, day grouping, Thumb,
                         ContinueCard, HistoryRow, SeriesCard, EpisodeRow, EpisodeDots), app-window,
                         torrent (store mirrored from the core: downloads every second, categories, archive; downloadsView;
                         labels, periods of the archive; TorrentRow, ArchiveRow, TorrentBar, CategoryDialog, SourceDialog;
                         categories and record helpers),
                         tracker (bookmarks, the page's address and history, the interception status line, a release page
                         waiting for the trackers tab, the bookmark of the open page's site, the last bookmark remembered)
    shared/            — ipc/ (bridge.ts — the only Tauri import for commands/events; typed wrappers: player, library,
                         settings, torrents, trackers, links (library ↔ torrents), window, app), lib/ (store, router, media, time, sizes and rates,
                         nativeLayer — dialogs hide the native trackers page while open), i18n/ (ru, en:
                         common, player, library, settings, torrents)
    test/              — Vitest setup, Tauri bridge mock (mock shared/ipc/bridge; it also stands behind
                         window.__TAURI_INTERNALS__, so a module that got the real bridge still reaches the mock), track,
                         library and torrent fixtures
  e2e/                 — Playwright: kino.ts (launches kino-desktop.exe, connects over CDP, `launch` fixture), player/history/
                         series/settings/torrents/series-torrents/trackers scenarios, `workdir` fixture, `webPage` (the trackers browser's
                         page by address), global-setup (fixture check + cargo build), fixtures/ (make-media.ps1, subtitle
                         templates, torrent.ts — a .torrent of a file or folder and its magnet link, trackerSite.ts — a tiny
                         tracker on the loopback, media/ — tiny generated clips: a series of 2 seasons and a film)
  src-tauri/           — Rust core:
    src/db.rs          — one SQLite file, migrations by PRAGMA user_version; player tables `player_*`, torrent tables `torrent_*`;
                         the only link between them: player_files.source / source_path (an opaque torrent hash)
    src/settings/      — Settings (typed, SPEC 6; one JSON row in app_settings, a broken value falls back alone), SettingsStore,
                         commands (get / update with a partial patch / reset → settings://changed; applied at once)
    src/library/       — Library (folders, positions, viewings, continue watching, history, clear history, series, key-value
                         storage, track memory; Policy from the settings: keep history, watched threshold),
                         episode (S02E05 / 2x05 / «Серия 5» → series key and folder), scan (video files, natural order),
                         series (seasons, next up, neighbours, summaries — pure), track_pref (match by language and title),
                         sources (files a source brought: linked, moved to their new place, season files, sidecar tracks),
                         search (series and played files, every word, any case), commands
    src/player/        — Player (libmpv; apply_settings, clear_history), video_host (child HWND), events (mpv event thread →
                         player://state, player://position, player://notice, player://autoplay; registers files, chooses tracks:
                         series memory first, then track_defaults; scans the series folder of an opened episode, autoplays the
                         next episode of the season), session (saves the position, takes frames), state (snapshot, pure +
                         tested), tracks (track-list parsing), track_defaults (preferred audio, subtitles with a Russian dub —
                         pure), commands
    src/power.rs       — KeepAwake: a Windows power request — for a video (screen + system) or for downloads (system)
    src/background.rs  — SPEC 4.6: the tray (speeds in the tooltip, «Пауза всех», «Открыть», «Выйти»), «Скачан»
                         notifications; none in the E2E tests (a killed test leaves a dead tray icon)
    src/torrent/       — Torrents (the engine + the archive + settings: preview, add, pause, remove, download / seed again,
                         details; the update loop is the only place where torrents finish — «Не раздавать» archives there),
                         engine (librqbit session with fast resume, reconcile with the archive, offline mode for tests,
                         .torrent / magnet reading), store (TorrentStore: own connection to the same db; categories, items,
                         files, case-insensitive search by every word), backup (the archive with its .torrent files in one
                         JSON file; a restore adds only what is missing), manage (a torrent's own seeding, full check,
                         re-announce, moving the files, saving the .torrent, the folder for unfinished torrents, deleting
                         the source .torrent), policy (the settings' rules the engine lacks, run by the update loop: the
                         alternative limits' schedule by its edges, seeding limits by ratio and time, the queue of
                         downloads / seeds / total with slow torrents left out — state `queued`; the trackers the engine
                         gets: merged from the same torrent added again + «свои трекеры»), speeds (30 minutes of speeds per torrent, peer speeds), commands (torrents://update
                         every second, torrents://changed, torrents://notice; settings://changed when the schedule switched
                         the limits). Engine network options (port, UPnP, protocol, peers, SOCKS5, DHT, LSD) are read at
                         start only. Knows nothing about the player
    src/trackers/      — Trackers (the browser webview: open, layout, reload; interception: magnet → trackers://magnet,
                         a download named .torrent or unknown (dl.php) → <data>\trackers\downloads, kept and sent as
                         trackers://torrent only if it is a .torrent inside, anything else not downloaded or deleted →
                         trackers://refused; trackers://state with the address, can-go-back / forward and the ads
                         stopped), history (WebView2 HistoryChanged, GoBack / GoForward), adblock (Brave's engine over
                         the shipped filters/ list), blocking (WebResourceRequested → 403 for ads, hiding styles after
                         DOMContentLoaded via ExecuteScript — the page never gets a way to call Kino), rules
                         (any web page allowed, app URLs and other schemes blocked, address normalization — pure), store
                         (BookmarkStore: bookmarks with positions), commands
    src/links.rs       — the one place where the library and the torrents meet (SPEC 5): a finished torrent's files are
                         linked to the library (and all finished ones at start), series sources for «Скачать снова»,
                         «Освободить место» (the torrent leaves the downloads first, an emptied one becomes «Файлы удалены»),
                         moving a torrent's files (the library's episodes move with them)
    src/instance.rs    — one Kino per data folder (SPEC 6 «Одно окно»): a named mutex; a later start hands its arguments
                         to the running one over WM_COPYDATA to a message-only window and quits → app://open. Keyed by the
                         data folder, so the tests' and a debug build's Kinos never meet the user's one
    src/media_keys.rs  — Windows' media session (System Media Transport Controls): follows player://state, keys →
                         media://key; off in the tests
    src/defaults.rs    — what Windows opens video, .torrent and magnet: with now (read only), its «Приложения по
                         умолчанию» page: a program may not choose itself
    src/updates.rs     — «Проверять обновления» (off by default): GitHub Releases of devatiywork/kino-v2 at start
                         and daily, a newer version told once (PendingUpdate, taken by the renderer); reqwest
    src/lib.rs         — single instance first, then setup (data dir, library, settings, torrents, trackers, tray, main
                         window from the config, media session, player), closing the window while torrents work hides it
                         in the tray, app_clear_history, app_open_url (http(s) only), app_reveal_path
    windows/hooks.nsh  — the installer's own steps: Kino's capabilities for «Приложения по умолчанию»
                         (bundle settings, file associations and the `magnet:` scheme are in tauri.conf.json)
  data                 — %APPDATA%\local.kino.app: kino.db, thumbs\<file id>.jpg (served to the page by the asset protocol),
                         torrents\files\<hash>.torrent (the archive), torrents\engine (librqbit state, DHT table),
                         trackers\downloads (.torrent files the trackers browser caught, cleared at start)
packages/ui/           — @kino/ui, our UI library
  src/styles/          — tokens.css (single source of design tokens, dark + light; accent presets ember/gold/lime/teal/violet
                         with a shade per theme), base.css (no browser legacy), index.css
  src/icons/           — own SVG icon set, 24px grid, stroke 1.8
  src/components/      — Button, IconButton, Pressable, Switch, SegmentedControl, SwatchPicker, Slider, Select, ListBox, Popover,
                         PopoverButton, Kbd, KeyRecorder, Checkbox (indeterminate), TextField (description, error, addon,
                         multiline),
                         ScrollArea, Logo, TitleBar, TitleBarNav, WindowControls, SearchField, SearchCombo (search with grouped
                         results, react-aria combobox), Tabs (toolbar, panelClassName),
                         Tooltip (useTooltipFor),
                         MenuButton, ContextMenu, Dialog/Modal, ConfirmDialog, ToastProvider/useToast
  src/lib/             — cn, tv, focusRing, desktopGuards, theme (applyTheme, ACCENTS, applyAccent), usePresence
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
- A setting lives in `src-tauri/src/settings/mod.rs` (with its default) and its mirror `src/shared/ipc/settings.ts`; it applies at once, there is no «Save»
- Remote pages (trackers) never get Tauri IPC access: capabilities are granted to the main window only
- Player and torrent modules do not import each other; they meet only in the app layer and through the optional file↔torrent link
- A torrent record is never lost implicitly: removing from downloads or deleting files keeps the archive entry; only "delete from archive" removes it, with confirmation
- Keep components under 150 lines — extract logic into hooks
- FSD layer rule: each layer imports only from layers below

## Testing

Every feature must be covered before it is considered complete:

- **Unit** — business logic in isolation (TS: Vitest; Rust: `cargo test`)
- **Integration** — IPC bridge, player service, module interactions with mocks
- **E2E** — critical user scenarios (open file, continue from history, switch track, autoplay, subtitles; add torrent with category, remove from downloads keeps archive, download again; a tracker's .torrent and magnet caught with the release page)

E2E runs the real debug build: Playwright connects to WebView2 over CDP (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port`).
Each launch gets its own temp folder; the core reads these variables:

- `KINO_DATA_DIR` — kino.db and thumbs instead of %APPDATA% (all builds), so tests never touch the real history
- `KINO_TEST_OFFLINE` — torrents without the network: no DHT, trackers, LSD or UPnP, listening on the
  loopback only (no firewall prompt), the default downloads folder is `<data>\downloads`, not the Windows one. The tests
  make a .torrent of a file already in place, so it is checked and seeded
- Playwright over CDP takes the browser's downloads for itself: `kino.ts` sends `Browser.setDownloadBehavior { behavior: 'default' }`
  so that the trackers browser's downloads reach Kino. The tracker scenarios run against `fixtures/trackerSite.ts`, never a real site
- `KINO_TEST_VOLUME`, `KINO_TEST_MONITOR` — start volume and the monitor (`1920x1080`) the window opens on, without focus
  (a later start brings it forward without the focus too). The harness sets 1% and Full HD; override with
  `KINO_E2E_VOLUME` / `KINO_E2E_MONITOR`. The test variables work in a release build as well, to try it without a firewall
  prompt
- No media session (media keys) and no tray while `KINO_TEST_OFFLINE` is set: the tests' videos never take the user's keys
- `KINO_ADBLOCK_LIST` — the ad blocker's rules from this file instead of the shipped list (the tests' own)
- `KINO_UPDATES_URL` — where Kino asks for its latest release instead of GitHub (the tests' own server; the first check
  then runs after a second). Under `KINO_TEST_OFFLINE` without it Kino never asks GitHub
- Test media is generated, never the user's own files

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
