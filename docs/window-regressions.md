# Window interaction fixes in 0.2.0

## Reproduction

The user reported repeated app-pinning shrinkage and difficult ghost interaction. Gemini drafted a window test and snooze domain helpers, but returned without a completed test report and then reached its quota. The parent reviewed the code, corrected the helper's wake behavior, finished the test coverage, and ran all checks itself.

Repeated native tuck/untuck operations exposed cumulative width drift. In this session the width grew from 342 to 418 over 20 cycles, rather than shrinking as on the user's display. The code used the native outer width as the next requested size. Windows' frame and DPI adjustments fed back into every subsequent resize.

The fix remembers the intended expanded width and height independently of native measurement, uses one replaceable timer for programmatic geometry changes, and keeps position saves from rewriting size. Twenty rapid cycles and four slower cycles now preserve the native dimensions within rounding tolerance. Unpinning and disabling tab mode restore the expanded note.

## Ghost mode

The old observer reapplied mouse-ignore and opacity settings even when nothing changed, measured at five calls to each setter during an idle 1.5 second observation. It also broadcast a full renderer update when Alt changed. The update caches native presentation state, avoids rebuilding an unchanged note, and samples Alt every 25ms while caching foreground and microphone work. The new idle test records zero redundant native mouse-ignore or opacity calls. Hover collapse has a small delay to avoid immediate fold/unfold oscillation.

The board has an explicit Exit ghost mode control and each ghost card has a recovery icon. The existing tray command and Ctrl+Alt+G remain available. Native physical dragging smoothness still depends on the desktop; the tests verify the interaction mechanisms without claiming a physical pointer trial.

## Snooze

Snoozed notes become ordinary non-topmost windows and a fixed native helper command lowers them without activation. They remain recoverable from the board. On expiry the note becomes topmost without taking keyboard focus; app-binding and global-hide rules continue to apply. The helper accepts only internally generated window handles and a lower operation, not arbitrary shell commands.

The UI test creates a report checklist, checks its first item, starts the existing focus timer, snoozes it, wakes it from the board, snoozes again, restarts the app, and verifies actual expiry. The timer and checked state remain intact throughout. Overnight burn protection, restart compatibility, and lifecycle resets have domain tests.

Tests use isolated temporary application-data directories. The user's installed app and personal notes were not changed by these tests.
