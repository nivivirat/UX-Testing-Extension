---
name: khda-qa-fix
description: Process a KHDA Visual QA export folder (qa/KHDA-QA-*) and fix every UI problem at its declared fix scope (global, pattern, component, instance), then write status back to issues.json and each issue's Fix report. Use when the user asks to process, fix or work through a KHDA QA report.
---

# Process a KHDA Visual QA export

Argument: path to the export folder. If not given, use the most recent `qa/KHDA-QA-*` folder and
say which one you picked.

## 0. Prepare

1. Read the repo `CLAUDE.md` (KHDA UI rules) — they apply throughout.
2. Read the export's `README.md` and `issues.json` (`schemaVersion` 1.2).
3. Find where design tokens live (tokens file, `tailwind.config.*`, global CSS with `--khda-*`
   variables). You need it for `global` scope and to pick tokens for the values in each description.
4. Skip issues whose status is `fixed`, `closed` or `verified`; work on `open` and `reopened`. For `reopened` issues read `history[]` first
   so you don't repeat the failed attempt.

## 1. Order

Process issues grouped by `scope.level`: **global → pattern → component → instance**.
Before each issue, re-check whether an earlier fix already resolved it.

## 2. For each issue

One issue = one element (or screen) + the tester's free-text **description**, which may list
several things. Fix **everything** it mentions.

1. **Read** `issues/<ID>.md` ("What's wrong" = `description`) and **view both images**
   (annotated `.webp`, element crop `.png`). Numbers like "(1)" in the description refer to the
   numbered marks on the annotated image. `flagged[]` lists CSS values the tester clicked in the
   inspector, with their current live values.
2. **Locate** the code: `element.source` (file:line) → else `element.componentChain` → else the
   selectors, visible `element.text` and `classList`.
3. **Fix location from scope** (never lower than the scope):
   - `global` — change the token/theme value; then replace hard-coded copies of the old value
     (hex, rgb, arbitrary Tailwind like `text-[#3A3A3A]`) with the token.
   - `pattern` — inventory first: search with every `scope.patternHints` entry (shared components,
     raw tags such as `<table>`/`<th>`, ARIA roles, class fragments). Fix the shared component,
     then bring every other implementation in line (migrate if low-risk, else fix in place).
   - `component` — the component's own file; list the other usages you checked.
   - `instance` — the call site only; do not touch shared components.
4. **Each point in the description**: apply the expected value or change it describes, using an
   existing design token / component / icon. If a point is ambiguous (no target value given and none
   in KHDA rules), leave it and report it as not fixed with the question to ask.
5. **Rules**: no inline styles, no `!important`, no arbitrary Tailwind values for non-instance
   scopes; logical properties (`ps-`/`pe-`, `ms-`/`me-`) so RTL works.
6. **Verify** if you can run the app: open `page.route` at `environment.viewport`, screenshot the
   element (and one other affected page for pattern/global) in `en`/LTR and `ar`/RTL, compare with
   the evidence. If you cannot, write "not visually verified" — never claim it.
7. **Record**:
   - Fill the issue's **Fix report** table (one line per point of the description in "Per point").
   - In `issues.json` set `status` and `resolution`:
     ```json
     {
       "status": "fixed | partially-fixed | unresolved",
       "fixedAtLevel": "<equals scope.level unless explained>",
       "problems": [{ "point": "Padding should be 12px", "status": "fixed", "note": "" }],
       "rootCause": "...",
       "filesChanged": ["..."],
       "affectedUsages": ["routes or components"],
       "tokensUsed": ["--khda-..."],
       "verification": "what you checked, or 'not visually verified'",
       "notes": "scope concerns, risky migrations left in place, missing info",
       "fixedAt": "<ISO timestamp>"
     }
     ```
   - Keep `issues.json` valid JSON; change only `status` and `resolution`.

## 3. Finish

Print: | ID | Scope | Points fixed | Status | Fixed at | Files changed | Verified |

Then list unresolved points and why, scope concerns, and pages the tester should retest.
Do not commit unless the user asks.
