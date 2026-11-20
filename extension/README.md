# KHDA Visual QA Capture — Chrome extension (v1.2)

Inspect a live KHDA screen like Figma Dev Mode, flag what is wrong, and export a report Claude Code
can fix from (`/khda-qa-fix`). Everything stays on this computer — no server, no cloud.

## Install / update

1. Open `chrome://extensions` → turn on **Developer mode**.
2. **Load unpacked** → select this `extension` folder. (Updating: click the ↻ reload icon on the
   extension card, then refresh the KHDA page.)
3. Pin **KHDA Visual QA** from the puzzle-piece menu.

## Use

Click the toolbar icon (or **Alt+Shift+Q**) on a KHDA page. A small floating toolbar appears in
the bottom-right corner — the page keeps its full width. Drag it by the ⋮⋮ grip.

| Toolbar | Does |
|---|---|
| **Inspect** | Hover any element: padding (green) and margin (orange) are shaded with their values, and a card shows size, font, colour, fill, padding, radius. **Click** to select. |
| 🖥 | Report a whole-screen issue (no element) |
| ☰ *n* | Issues list, Export ZIP, Import, Settings (⚙) |
| ✕ | Hide the toolbar |

### With an element selected

- The **inspector panel** shows a box-model diagram and Layout / Typography / Fill / Border values,
  with matching design tokens in blue.
- **Click any value to flag it** (optional — it turns red). Flagged values are pre-filled in the
  description and listed for the developer with their live values. Everything goes into **one issue**.
- Hold **Alt** and hover another element to **measure the distance** between them.
- **↑ / ↓** select the parent / go back to the child. **Esc** deselects; Esc again exits Inspect.
- **Report issue** (or Enter) opens the editor.

### Editor (opens over the page)

Just four things:

1. **Describe** everything that's wrong in one box. Flagged values are already listed
   (`padding-top: 8px → `) — type what they should be. Mention marks as "(1)", "(2)".
2. **Severity** — one click.
3. **Fix** — *Only this* · *This component* · *All like this* (e.g. every table) · *Everywhere*
   (design token). The suggested one has a green dot.
4. **Figma link** — optional.

On the screenshot: **Box** / **Arrow** add numbered marks, **Blur** hides sensitive data (emails,
phones, Emirates IDs and filled inputs are blurred for you), **↶** undoes. The title is generated
from the first line of your description. **Ctrl+Enter** saves, **Esc** cancels.

Each issue exports **two images**: the annotated screenshot (WebP, max 1920 px wide) and a
full-resolution crop of the selected element (PNG) — usually 30–150 KB per issue.

### Issues panel (☰)

- **Issues** tab — one line per issue: severity dot, title (click to open), ID, and the page link
  (click to go to the page where it was reported). Click the status pill to change it.
  Filter with **All / Open / With dev / Closed** and by page.
- **Retest** tab — issues the developer marked *Fixed*, *Partly fixed* or *Couldn't fix*, grouped by
  page with an **Open page** link and the developer's note. Check each one, then
  **Looks good · Close** or **Still wrong · Reopen**.

Statuses: **Open** → (developer) **Fixed / Partly fixed / Couldn't fix** → (you) **Closed** or
**Reopened**. Issues marked *verified* by older versions show as **Closed**.

### Export and retest

- **Export ZIP** saves `KHDA-QA-<date>-<ENV>-<PREFIX>.zip` to Downloads. Closed issues are left out.
- Developers unzip it into `qa/` and run `/khda-qa-fix` (see `../developer-kit`).
- When they send back `issues.json`: **Import** → the Retest tab opens with what to check.

### Settings (☰ → ⚙)

Project name, project code, environment, your tester prefix (IDs look like `KHDA-UX1-001`; give
every tester a different prefix), auto-blur suggestions, element outline, and **Backup / Restore**.

## Keeping your issues safe

Issues live inside the extension in this Chrome profile. They survive **reloading** the extension
(↻ on `chrome://extensions`) and updating its files. They are lost if you **remove** the extension,
load it from a **different folder**, or clear browser data — so before any of those, use
**⚙ → Download backup**, and **Restore backup** afterwards (restore only adds or updates, never
deletes).

## Notes

- Chrome warns the extension can "read and change data on all websites" because it must inspect and
  screenshot whichever KHDA environment you open. It only acts when you use the toolbar. To limit it,
  replace `<all_urls>` in `manifest.json` with your KHDA hosts and reload.
- Source file:line appears when the app build stamps elements (see `../developer-kit/README.md`).
- Only the visible part of the page is captured. Elements inside iframes cannot be inspected.
  Personal names are not blurred automatically.
