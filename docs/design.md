# Real Sticky Note for Windows

An independent Windows implementation of the public CrushPaper workflow, using original code and assets. No claim of affiliation or source-code reuse. The repository initially contained only README.md and an icon. Node 24 is available; no .NET SDK is installed.

## Desktop behavior

Electron owns a compact tray board and one frameless, resizable, always-on-top window per floating note. Closing the board keeps the tray and notes alive. Notes reopen at their saved positions on restart, clamped to a connected monitor. Quick capture uses Ctrl+Shift+T; Ctrl+Shift+Space toggles the board; Ctrl+Alt+G releases ghost mode. Tray menu also exposes these actions.

All note changes persist atomically to local JSON with a backup. No accounts, telemetry, or cloud. Clipboard link capture is opt-in and only accepts single HTTP(S) links, strips common trackers, rejects credentials and sensitive URL parameters, and never downloads page content.

## Features

Board filters, search, note colors, plain text and checklists, due dates, daily/weekly repeats, editing, floating, dragging, focus timers, four completion animations and optional generated paper sounds. Completing the last checklist item completes the note. Incomplete checklists cannot be completed with a separate button.

Optional midnight burn moves undated one-off plain notes to Ashes, never incomplete checklists, dated notes, or repeats. Off by default to respect persistence until done. Completion and burn are recoverable. Repeating notes create their next occurrence on completion, advancing past today without creating missed-occurrence floods.

App notes bind to the foreground process, follow its window, and hide on app changes. A hidden PowerShell/C# helper observes foreground process and window bounds, Alt key, and Windows microphone registry state. Ghost notes pass clicks through until Alt is held. Capture protection uses Electron's native Windows display-affinity support, subject to Windows/capture software limitations. Automatic protection during microphone use is optional and conservatively applies to all notes.

Daily Wrap includes autosaved per-day journal, win, tomorrow's task, mood, completed list, focus minutes, saved history, and local PNG card export. Saved Links persist independently of note burn. Settings include startup, visibility, ghost opacity, capture protection, sounds, effect, scheduling, and backup import/export.

## Visual direction

Follow the reference's compact frosted board, narrow category chips, colored paper cards, quiet gray controls, and handwritten note text. Windows Segoe UI for controls, Segoe Print for paper. Palette: glass #f2f3f1, ink #30332d, muted #777c72, yellow #f5df8d, mint #cbe5c8, rose #f1c9ce, blue #cbdff0. This is a desktop utility, not a marketing page.

## Acceptance

Node tests cover completion rules, burn protection/catchup, recurrence, URL validation, and corrupt-store recovery. A real Electron integration test drives board and floating windows, cross-window checklist changes, timers, ghost release, reload persistence, journal, links, and export. Package an x64 Windows installer and unpacked executable. Record exact limitations and evidence in README and docs/verification.md.
