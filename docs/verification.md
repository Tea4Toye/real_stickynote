# Verification record

Built on Windows 11 x64, build 26200, using Node 24.14.1, Electron 45.1.0, Playwright 1.64.1, and electron-builder 26.18.0.

## Automated checks

`npm test`: 32 passing tests. Covers note validation, checklist completion guards, local date rollover and catchup, dates/checklist/repeat burn protection, weekly anchors, recurrence after absence, restore, URL filtering, durable storage, damaged-primary recovery, unrecoverable-data preservation, and failed-write rollback.

`npm run test:desktop`: passed with real Electron windows and an isolated temporary data directory. Covers editor controls, colored checklists, native always-on-top flag, partial-completion rejection, relaunch with saved checkbox state, ghost opacity/release, final-checkbox completion, recovery, timer setup, journal autosave, PNG export, saved links, backup export, safe defaults, notes remaining open when the board hides, helper startup, and no renderer exceptions.

`npm run test:edges`: passed. Covers startup midnight catchup, protected notes, expired-timer notification state and once-only focus accounting, weekly recurrence, hide/show all note windows, link parsing/deduplication, share-card exclusions surviving autosave, and wide PNG dimensions.

Native collapsed-tab height and re-expansion after disabling tucking or unpinning were also verified. Windows enforces a small minimum window height, so the tab test accepts a compact height up to 64 device-independent pixels.

The execution session could not read back text it wrote to the native Windows clipboard, and the foreground-window observer returned no active desktop window. Link ingestion was therefore tested using injected standard Electron ClipboardItem input, explicitly reported by the test. This verifies ingestion logic, not a live user clipboard. The helper compiled and emitted valid JSON without errors. App switching, live microphone detection, holding Alt, and capture exclusion still need interactive Windows validation. Global shortcuts registered in the desktop test; physical shortcut delivery was not simulated.

## Distribution

Electron's Windows x64 runtime was downloaded over HTTPS with PowerShell after Node's direct GitHub connection timed out. Its SHA-256 matched the checksum shipped with the Electron package:

```text
55eaba17abff7b5bba6c3bbc85068967379024fe742fe9c7fdba9118922ccbe2
```

The Windows installer and unpacked app are generated under `release/`. PowerShell helpers are unpacked outside app.asar so Windows can launch them. The build has original artwork and app metadata and is unsigned. No installer was run against the user's account during testing.

The desktop suite also passed against `release/win-unpacked/Real Sticky Note.exe`, including restart persistence, native note windows, and the packaged PowerShell helper starting without an error. Tests use isolated temporary application data and disable startup and protocol registration.

Final artifact hashes and sizes are recorded in `release/SHA256SUMS.txt` after the final build.
