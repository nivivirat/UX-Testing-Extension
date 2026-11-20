---
name: khda-qa-fix
description: Process a KHDA Visual QA export folder (qa/KHDA-QA-*) and fix every open UI issue at its declared fix level (global, pattern, component, instance), then write status back to issues.json and each issue's Fix report. Use when the user asks to process, fix or work through a KHDA QA report.
---

# Process a KHDA Visual QA export (format 2.0)

Argument: the export folder. If none is given, use the newest `qa/KHDA-QA-*` folder and say which.

The export is built to be cheap to read. Keep it that way:
- Read `README.md` once — it holds the work rules and the fix-level definitions (not repeated per issue).
- Each `issues/<ID>.md` is short and self-sufficient. `issues.json` is only for writing results back.
- Images cost tokens: open the **element** image first; open the **screen** image only if the
  description mentions numbered marks "(1)" or page layout, or the element image is not enough.
- Never open images or files of issues listed under "Other issues" — they are reference only.

## Steps

1. Read the repo `CLAUDE.md` (KHDA UI rules) and the export `README.md`.
2. Find where design tokens live (tokens file, `tailwind.config.*`, global CSS `--khda-*`). You need
   it for GLOBAL fixes and to pick tokens for values in descriptions.
3. Work through the README's issue table **in order** (global → pattern → component → instance).
   Before each issue, check whether an earlier fix already solved it.
4. For each issue (`issues/<ID>.md`):
   1. **REOPENED?** Read "Retest feedback" first — it says what is still wrong and what the
      previous fix changed. Do not repeat that fix.
   2. **Locate** the code: `Source` file:line → else `Component` chain → else `Selector` / classes.
      "Now:" lists the element's current values; compare them with the description.
   3. **Fix every point of "What's wrong"** at the issue's **Fix** level, never lower:
      - GLOBAL: change the token/theme value, then replace hard-coded copies of the old value.
      - PATTERN: list every implementation first (use "Find every implementation via"), fix the
        shared component, then bring the others in line.
      - COMPONENT: the component's own file only; no call-site overrides.
      - INSTANCE: the call site only; do not touch shared components.
      Use existing tokens/components/icons. No inline styles, `!important` or arbitrary Tailwind
      values (except INSTANCE). Use logical properties (`ps-`/`pe-`, `ms-`/`me-`) so RTL works.
      If a point has no target value and none follows from KHDA rules, do not guess — mark it
      "not fixed" with the question to ask.
   4. **Verify** if you can run the app: open the page at the given viewport, check the element
      (and one other affected page for PATTERN/GLOBAL) in LTR and RTL. Otherwise write
      "not visually verified" — never claim it.
   5. **Record**: fill the issue's Fix report row, and in `issues.json` set that issue's `status`
      and `resolution` (keep the JSON valid; change nothing else):
      ```json
      {
        "status": "fixed | partially-fixed | unresolved",
        "fixedAtLevel": "global | pattern | component | instance",
        "problems": [{ "point": "Padding should be 12px", "status": "fixed", "note": "" }],
        "rootCause": "one line",
        "filesChanged": ["src/..."],
        "affectedUsages": ["routes or components"],
        "tokensUsed": ["--khda-..."],
        "verification": "what you checked, or 'not visually verified'",
        "notes": "short",
        "fixedAt": "<ISO timestamp>"
      }
      ```
5. Finish with: | ID | Level | Points fixed | Status | Files changed | Verified |
   then unresolved points with the question to ask, and pages the tester should retest.
   Do not commit unless the user asks.
