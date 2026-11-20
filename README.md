# KHDA Visual QA

Visual QA workflow for KHDA web applications: inspect a live screen like Figma Dev Mode, report what
is wrong, and hand developers a report that Claude Code can fix from.

| Folder | What it is |
|---|---|
| [`extension/`](extension/) | Chrome extension (Manifest V3) — floating toolbar, inspector, issue editor, ZIP export. See its [README](extension/README.md). |
| [`developer-kit/`](developer-kit/) | What developers add to the app repo: `CLAUDE.md` rules, the `/khda-qa-fix` Claude Code skill, and a Babel plugin that stamps source file:line on elements. |
| [`EXPORT_FORMAT.md`](EXPORT_FORMAT.md) | The export contract between the extension and Claude Code. |
| [`PUBLISHING.md`](PUBLISHING.md) | How to share the extension with other testers (Chrome Web Store, Edge, GitHub release). |
| [`scripts/`](scripts/) | `package.mjs` builds the store ZIP; `make-icons.py` redraws the icons. |

## Quick start

1. `chrome://extensions` → Developer mode → **Load unpacked** → `extension/`.
2. Open a KHDA page, press **Alt+Shift+Q**, click **Inspect**, select an element, **Report issue**.
3. **☰ → Export ZIP**, give the ZIP to the developers.
4. Developers unzip into `qa/` in the app repo and run `/khda-qa-fix` in Claude Code.

All captured data stays in the tester's browser unless exported.
