# KHDA Visual QA — Export Format Specification (v1.2)

> **v1.2 (extension 1.2) — current.** Supersedes the "problems / findings" model of v1.1.
>
> - One issue = one element (or whole screen) + a **free-text `description`** written by the tester.
>   It can list several things wrong. `title` is generated from its first line.
> - `flagged[]` — CSS values the tester clicked in the inspector: `{ property, current, category }`.
>   Optional helper; the description is what must be fixed.
> - `marks[]` — numbered boxes/arrows on the annotated screenshot (`{ n, type }`); the description
>   refers to them as "(1)", "(2)".
> - **Two images per issue:** `screenshots/<ID>-annotated.webp` (redacted, marks drawn, element
>   outlined, max 1920 px wide) and `screenshots/<ID>-element.png` (full-resolution crop of the
>   selected element). No unannotated copy is exported. Older issues may still export `.png`.
> - Markdown: "What's wrong" (the description, quoted) + "Values the tester flagged" table replace the
>   v1.1 Problems table. `scope.appliesTo` is filled automatically from the scope.
> - `resolution.problems[]` — per-point status written back by Claude.
> - **Statuses (extension 1.3):** `open`, `reopened` (tester) → `fixed`, `partially-fixed`,
>   `unresolved` (developer) → `closed` (tester confirmed) or `reopened`. `verified` from older
>   exports means `closed`.
> - **Export scope (extension 1.4):** only `open` and `reopened` issues are exported in full
>   (`issues[]`, `issues/<ID>.md`, screenshots). All others are listed in `otherIssues[]`
>   (`{ id, title, status, page, devNote }`) and as a short text list at the end of `README.md`.
> - Still written for older readers: `observed` (= description), `annotations[]`.
>
> Sections below describe v1.0; folder layout, fix scope, element data and resolution are unchanged
> except where noted above.

This is the contract between the **KHDA Visual QA Capture** extension (what the tester exports)
and **Claude Code** (what the developer feeds it). The extension must produce exactly this; the
developer kit (`developer-kit/`) teaches Claude how to consume it.

Design goal: a developer drops the folder into the repo, types `/khda-qa-fix`, and Claude fixes
every issue **at the correct level** (token / pattern / component / instance), with no rewriting
or interpretation by the developer.

---

## 1. Folder layout

```
KHDA-QA-<YYYY-MM-DD>-<ENV>-<PREFIX>/        e.g. KHDA-QA-2026-11-16-UAT-UX1/
├── README.md              Index + processing order + how to run (read first by Claude)
├── issues.json            Source of truth (machine-readable, Claude writes status back here)
├── issues/
│   └── <ISSUE-ID>.md      One self-contained file per issue
└── screenshots/
    ├── <ISSUE-ID>-full.png        Full viewport, unannotated
    ├── <ISSUE-ID>-annotated.png   Full viewport with tester's markers
    └── <ISSUE-ID>-element.png     Tight crop of the selected element (+16px margin)
```

Rules:
- All paths inside the export are **relative** so the folder works wherever it is unzipped.
- Issue IDs are `<PROJECT>-<TESTER PREFIX>-<NNN>` (e.g. `KHDA-UX1-003`) so exports from several
  testers can be merged without collisions.
- Images are PNG, no compression artefacts. Redacted areas are blurred **before** export; no
  unredacted copy is ever written.

---

## 2. Fix scope — the core concept

Every issue carries a **fix scope**. It tells Claude *where* the fix belongs, so a change to one
table becomes a change to all tables when that is what the tester means.

| Scope | Tester means | Claude must fix in | Claude must NOT |
|---|---|---|---|
| `global` | "This value is wrong everywhere" (a colour, font, base size, radius) | Design tokens / theme / Tailwind config / global CSS variables | Touch individual components to override the value |
| `pattern` | "All elements of this **kind** are wrong" (all tables, all primary buttons, all page titles) — even if built differently in different places | The shared component **and** every stray implementation of the same pattern it finds | Fix only the instance on the captured page |
| `component` | "This React component is wrong wherever it is used" | The component's own source file (the one shared by all usages) | Add page-level overrides or props hacks at the call site |
| `instance` | "Only this one element on this page is wrong" | The call site / page file | Change the shared component (would affect other pages) |

**Fix hierarchy** Claude follows: `global → pattern → component → instance`. A fix always goes to
the *highest* level that matches the scope; never lower. Inline `style={}`, `!important`, and
page-specific class overrides are forbidden for `global`, `pattern` and `component` scopes.

**Processing order**: README lists issues grouped by scope in the order above, because a global
token fix frequently resolves lower-scope issues automatically. Claude re-checks each lower issue
after higher fixes before editing anything.

### How the extension helps the tester pick the scope

The tester always makes the final choice. The extension pre-selects a suggestion:

| Signal captured | Suggested scope |
|---|---|
| Category is Color / Typography and the current value matches (or should match) a design token | `global` |
| Element tag/role is a recognised pattern (`table`, `role=grid`, `button`, `h1`–`h3`, form field, card, modal, tab) | `pattern` (tester names it: "All data tables") |
| Component chain contains a shared component (source under `src/components/`) **and** page has >1 instance | `component` |
| Otherwise | `instance` |

For `pattern` scope the tester fills **"Applies to"** in plain words (e.g. "All data tables in the
application") and the extension records **pattern hints** (tag, role, shared component name,
class fragments) that Claude uses to locate every implementation.

---

## 3. `issues.json` schema

```jsonc
{
  "schemaVersion": "1.0",
  "export": {
    "project": "KHDA Employee Suggestion System",
    "environment": "UAT",
    "baseUrl": "https://uat.example.khda.gov.ae",
    "reporter": "UX1",
    "exportedAt": "2026-11-16T10:42:00+04:00",
    "tool": "KHDA Visual QA Capture 1.0.0"
  },
  "issues": [
    {
      "id": "KHDA-UX1-001",
      "title": "Table header text vertically misaligned",
      "category": "alignment",            // spacing | sizing | typography | color | border | shadow |
                                          // alignment | rtl | component-behavior | responsive | content | other
      "severity": "high",                 // critical | high | medium | low
      "status": "open",                   // open | fixed | partially-fixed | unresolved | verified | reopened

      "scope": {
        "level": "pattern",               // global | pattern | component | instance
        "appliesTo": "All data tables in the application",
        "patternHints": {                 // only for pattern
          "tags": ["table", "th"],
          "roles": ["grid", "columnheader"],
          "components": ["DataTable", "TableHeader"],
          "classFragments": ["table", "thead"]
        },
        "alsoSeenOn": ["/suggestions", "/reports/monthly"],   // tester-noted pages (optional)
        "suggestedByTool": "pattern"      // what the extension pre-selected
      },

      "observed": "Header text sits at the top of the cell...",   // tester, plain words
      "expected": "Header text vertically centred, 12px top/bottom padding...",

      "changes": [                        // structured property changes, one row each
        {
          "property": "padding-top",
          "current": "8px",               // auto-captured from computed style
          "expected": "12px",             // tester (or enrich step from Figma)
          "token": "--khda-space-3",      // known token for the expected value, if any
          "source": "figma"               // figma | khda-rule | tester
        }
      ],

      "annotations": [                    // numbered markers drawn on the screenshot
        { "n": 1, "type": "rect", "note": "Header row: text not centred" }
      ],

      "page": {
        "url": "https://uat.example.khda.gov.ae/employees?tab=active",
        "route": "/employees",
        "title": "Employee Management",
        "lang": "en",
        "dir": "ltr"
      },
      "environment": {
        "viewport": { "width": 1920, "height": 1080 },
        "devicePixelRatio": 1,
        "browser": "Chrome 142",
        "os": "Windows 11",
        "capturedAt": "2026-11-16T10:15:22+04:00"
      },

      "element": {
        "tag": "th",
        "role": "columnheader",
        "text": "Employee Name",
        "source": "src/components/DataTable/TableHeader.tsx:42",   // from data-source attr, if present
        "componentChain": ["EmployeesPage", "DataTable", "TableHeader", "HeaderCell"],
        "selector": "[data-source='src/components/DataTable/TableHeader.tsx:42']",
        "fallbackSelectors": ["role=columnheader[name='Employee Name']", "main table thead th:nth-child(1)"],
        "classList": ["px-4", "py-2", "text-left", "font-semibold", "text-sm"],
        "boundingBox": { "x": 312, "y": 288, "width": 180, "height": 40 },
        "computedStyles": {               // filtered to properties relevant to the category
          "padding": "8px 16px", "vertical-align": "top", "line-height": "20px",
          "font-size": "14px", "font-weight": "600", "color": "rgb(31, 41, 51)"
        },
        "cssVariables": { "--khda-text-primary": "#1F2933" },   // custom properties resolving on element
        "instancesOnPage": {
          "sameComponent": 6,             // elements rendered by the same component on this page
          "sameClassList": 6
        }
      },

      "figma": {
        "url": "https://www.figma.com/design/<fileKey>/KHDA?node-id=123-456",
        "fileKey": "<fileKey>",
        "nodeId": "123:456",
        "screenshot": null                // filled by optional enrich step: "screenshots/KHDA-UX1-001-figma.png"
      },

      "evidence": {
        "full": "screenshots/KHDA-UX1-001-full.png",
        "annotated": "screenshots/KHDA-UX1-001-annotated.png",
        "element": "screenshots/KHDA-UX1-001-element.png"
      },

      "acceptanceCriteria": [             // scope-generated defaults + tester additions
        "Every data table in the app shows vertically centred header text"
      ],

      "resolution": null                  // written by Claude, see §5
    }
  ]
}
```

Additional fields written by extension v1.0:

| Field | Meaning |
|---|---|
| `redactions` | Number of pixelated areas in the images (Claude should ignore those blocks) |
| `element.sourceFrom` | `data-attribute` (stamped on the element), `react-debug` (React dev build), `ancestor-attribute` (nearest stamped parent) or `null` |
| `element.componentNamesMinified` | `true` when component names look minified (production build) |
| `evidence.element` | `null` for whole-screen issues (no element picked); `element` is then `null` too |

Field ownership:

| Owner | Fields |
|---|---|
| Auto-captured | `page`, `environment`, `element`, `changes[].current`, `figma.fileKey/nodeId`, `evidence`, `scope.suggestedByTool`, `scope.patternHints` |
| Tester | `title`, `category`, `severity`, `scope.level`, `scope.appliesTo`, `scope.alsoSeenOn`, `observed`, `expected`, `changes[].expected`, `annotations[].note`, `figma.url`, extra acceptance criteria |
| Generated at export | default `acceptanceCriteria` (by scope), `changes[].token` (value→token lookup) |
| Claude (developer side) | `status`, `resolution` |

---

## 4. Per-issue Markdown (`issues/<ID>.md`)

Each file must be understandable on its own. Fixed section order:

1. **Header table** — ID, severity, category, status, page, viewport, lang/dir
2. **Fix scope** — level + "Applies to" + a scope-specific instruction block (verbatim templates below)
3. **What's wrong** — tester's `observed`
4. **Expected result** — tester's `expected`
5. **Property changes** — table: Property | Current | Expected | Token | Source
6. **Visual evidence** — embedded annotated image, element crop, Figma image if present; annotation legend (numbers → notes)
7. **Where to look in code** — source file:line, component chain, classes, instances on page, pattern hints
8. **Figma reference** — link (+ "developer has no Figma access; use the embedded image and the property table")
9. **Acceptance criteria** — numbered
10. **Captured element data** — full JSON in a fenced block
11. **Fix report** — empty template that Claude fills in

### Scope instruction templates (inserted verbatim under "Fix scope")

**global**
> Fix this at the design-token / theme level (tokens file, Tailwind theme, global CSS variables).
> Do not override the value inside individual components. After the change, search the codebase
> for hard-coded copies of the old value and replace them with the token.

**pattern**
> This applies to **every** element of this kind in the application, not only the captured one.
> 1. Find all implementations using the pattern hints (shared components, raw tags/roles, class fragments).
> 2. Fix the shared component first.
> 3. Migrate or fix every other implementation so they all match. If a migration is risky, fix it in place and list it in the fix report.
> 4. List every file and page affected in the fix report.

**component**
> Fix this inside the component's own source file so every usage changes.
> Do not add props, wrapper classes or overrides at the call site. List the other usages you checked.

**instance**
> Fix only this occurrence, at the call site / page file. Do not modify the shared component,
> because that would change other pages. If you believe the issue actually exists in every usage,
> say so in the fix report instead of widening the change.

---

## 5. Resolution (written back by Claude)

Claude updates `issues.json → issues[].status` and `resolution`, and fills the **Fix report**
section of the issue's Markdown file:

```jsonc
"resolution": {
  "status": "fixed",                      // fixed | partially-fixed | unresolved
  "fixedAtLevel": "pattern",              // must equal scope.level unless explained
  "rootCause": "TableHeader used py-2 and align-top; two report pages used a raw <table>.",
  "filesChanged": [
    "src/components/DataTable/TableHeader.tsx",
    "src/pages/Reports/MonthlyReport.tsx"
  ],
  "affectedUsages": ["/employees", "/suggestions", "/reports/monthly"],
  "tokensUsed": ["--khda-space-3"],
  "verification": "Re-screenshotted /employees and /reports/monthly at 1920x1080 LTR and RTL; header centred.",
  "notes": "",
  "fixedAt": "2026-11-17T09:30:00+04:00"
}
```

The tester re-imports `issues.json` into the extension, retests, and sets `verified` or `reopened`.
A reopened issue keeps its previous `resolution` in `history[]` so the next attempt sees what failed.

---

## 6. Extension export checklist

- [ ] Every issue has a scope level; `pattern` issues have `appliesTo`
- [ ] Every annotation number in the image has a note in `annotations[]`
- [ ] `changes[]` has at least one row, or `expected` is written precisely enough to act on
- [ ] Source file captured (warn tester if the app build has no `data-source` attributes)
- [ ] All three screenshots present; redaction applied
- [ ] Markdown generated from `issues.json` (never edited separately)
- [ ] README lists issues grouped `global → pattern → component → instance`
