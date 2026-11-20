# KHDA Visual QA — export format (v2.0)

The export is what developers hand to Claude Code (`/khda-qa-fix`). It is designed so Claude gets
everything it needs to fix an issue correctly while reading as few tokens as possible.

## Folder

```
KHDA-QA-<YYYY-MM-DD>-<ENV>-<INITIALS>/        one project per export
├── README.md                 how to work, fix-level rules (once), issue order, "other issues" list
├── issues.json               slim tracking file — Claude writes status/resolution back here
├── issues/<ID>.md            one short file per OPEN or REOPENED issue
└── screenshots/
    ├── <ID>-element.webp     crop of the selected element, max 1000 px — Claude views this first
    └── <ID>-annotated.webp   whole screen with marks, max 1280 px (1568 px for whole-screen issues)
```

- Only **open** and **reopened** issues are exported in full. Fixed / partly fixed / couldn't fix /
  closed issues appear as one line each under "Other issues" in `README.md` and in
  `issues.json → otherIssues[]`, with no files or images.
- Images are WebP and sized to what Claude actually reads. Claude bills about width × height / 750
  tokens per image and shrinks anything larger than ~1568 px anyway.
- Personal data is pixelated before export (emails, phones, Emirates IDs, filled inputs, plus
  anything the tester blurred).

## `issues/<ID>.md`

| Section | Content |
|---|---|
| Header line | Fix level + what it applies to, severity, REOPENED flag, page route, viewport, language/direction |
| What's wrong | The tester's description, quoted. "(1)", "(2)" refer to marks on the screen image. Optional one-line list of values flagged in the inspector. |
| Retest feedback | Reopened issues only: the tester's note, the previous fix and the files it changed. |
| Where to look | Source `file:line`, component chain (+ count on page), selector, classes (hard-coded values flagged), **Now:** one-line current styles, matching tokens, and for PATTERN the hints to find every implementation. |
| Evidence | Element image (view first), screen image (only if needed), Figma link if given. |
| Done when | Acceptance criteria derived from the fix level. |
| Fix report | One empty row Claude fills in. |

The fix-level rules (GLOBAL / PATTERN / COMPONENT / INSTANCE) are written once in `README.md`.

## `issues.json`

```jsonc
{
  "schemaVersion": "2.0",
  "export": { "project": "KHDA CRM", "environment": "UAT", "reporter": "NM", "exportedAt": "…", "tool": "…" },
  "issues": [
    { "id": "KC-NM-001", "title": "…", "status": "open", "severity": "high", "scope": "pattern",
      "page": "/employees", "file": "issues/KC-NM-001.md", "resolution": null, "history": [] }
  ],
  "otherIssues": [ { "id": "KC-NM-000", "title": "…", "status": "closed", "page": "/…", "devNote": "" } ]
}
```

Claude sets `status` (`fixed` / `partially-fixed` / `unresolved`) and `resolution`:
`{ status, fixedAtLevel, problems[{point,status,note}], rootCause, filesChanged[], affectedUsages[], tokensUsed[], verification, notes, fixedAt }`.
The tester imports the file; issues show up in the extension's **Retest** tab.

## Statuses

`open` → (developer) `fixed` / `partially-fixed` / `unresolved` → (tester) `closed` or `reopened`
(with a required note, kept in `history[]`). `verified` from older versions means `closed`.

## Typical size per issue

About 450–550 text tokens, plus the images (about 1,200 tokens for the screen and 200–800 for the
element crop). That is roughly half of format 1.x.
