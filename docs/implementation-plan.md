# Windows sticky notes implementation plan

**Goal:** Ship a runnable Windows desktop app implementing the documented reference workflow and persistent checklists.

**Architecture:** Electron main process is the sole data writer. Sandboxed renderer windows communicate through a narrow preload bridge. Pure domain functions handle transitions; a Windows helper supplies foreground state.

**Stack:** Electron 45.1.0, plain HTML/CSS/JavaScript, Node test runner, Playwright for Electron, electron-builder.

**Spec:** docs/design.md

## Global constraints

Local-only data. Never execute the Mac installer. No copied proprietary assets. Gemini tasks have explicit files and interfaces; parent reviews every result. Startup and clipboard reading off by default. Incomplete checklists survive midnight.

## Work units

- [x] Domain and durable storage: src/shared/domain.cjs and src/main/store.cjs. Tests exercise realistic lifecycle, rollover, validation, and corruption recovery using temporary directories.
- [x] Desktop integration: src/main/index.cjs, src/main/windows.cjs, src/main/preload.cjs. Main exposes snapshot/action IPC only; renderer cannot read files or invoke arbitrary native methods. Test floating windows and native properties with real Electron.
- [x] Board and notes: src/renderer/index.html, app.js, styles.css. Single route selected from query; board, note, wrap, links, settings share snapshot subscriptions. Test user actions through accessible roles and inspect rendering screenshots locally.
- [x] Windows observations: src/main/observe-windows.ps1. Hidden child process, fixed code, JSON lines only; app notes hide on process switch, reappear for bound process, ignore own windows; Alt releases click-through. Verify helper output; interactive app-follow positioning remains a documented platform validation limit.
- [x] Packaging and delivery: original icon, README usage and feature parity, desktop integration test, installer. Run npm test, npm run test:desktop, npm run build, launch packaged exe in isolated test data directory.
