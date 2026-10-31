# CrushPaper reference research

Research completed October 30, 2026. Gemini 3.8 Flash investigated the public website, installer, author links, and guides. Parent independently checked the feature pages and terms.

## Source availability

No official public source repository or open-source license was located. The site distributes compiled macOS DMG and ZIP files. This finding does not establish that no source exists elsewhere or privately.

- Product: https://crushpaper.pages.dev/
- Terms: https://crushpaper.pages.dev/terms
- Author profile investigated: https://github.com/tekkdevv
- Installer inspected as text, never executed: https://crushpaper.pages.dev/install.sh

The published terms allow free personal and work use on Macs and restrict redistribution of the app and modified copies without written permission. This Windows project uses original code, icon, and generated sounds; no macOS binary or original assets are bundled. It is an independent implementation, not an authorized port.

## Reference behaviors

The homepage describes floating notes, a board, daily recovery through Ashes, four completion effects, app notes, ghost mode, privacy, and a focus timer. These official guides supply the detailed public specification:

- https://crushpaper.pages.dev/pin-notes-to-apps-mac
- https://crushpaper.pages.dev/daily-wrap-mac
- https://crushpaper.pages.dev/save-links-read-later-mac
- https://crushpaper.pages.dev/shortcuts
- https://crushpaper.pages.dev/changelog

App notes attach to the foreground application, follow its window corner, hide on app switch, and tuck into hover tabs. Ghost mode passes clicks through until a modifier is held. Privacy requests capture exclusion, optionally during microphone use. Daily Wrap saves a journal and exports a card. Link Catcher is opt-in and maintains a separate link archive. URL commands control capture, completion, timers, board, privacy, and wrap.

## Windows choices

Electron supplies tray windows, topmost notes, global shortcuts, capture protection, click-through, and notifications. A hidden Windows API helper observes foreground bounds, Alt, and microphone registry activity. The app uses its own realsticky URL scheme. Clipboard titles are not fetched, updates are manual, sounds are synthesized, and animations are original approximations.

For the user's persistence requirement, midnight burn starts disabled and never burns checklists. See README.md for other intentional differences and docs/verification.md for interactive Windows checks still needed.
