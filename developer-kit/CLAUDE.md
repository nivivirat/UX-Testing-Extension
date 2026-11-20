# KHDA UI Implementation Rules

<!-- Add this section to the KHDA app repo's CLAUDE.md. Merge KHDA's own strict design rules
     (type scale, spacing scale, palette, component specs) into section 3. -->

You are working on a KHDA application (React). These rules are mandatory for any UI change,
and especially when processing a KHDA Visual QA export (`qa/KHDA-QA-*/`).

## 1. Source of truth

1. For QA issues, the issue's **What's wrong** description and screenshots are the design
   source of truth (the description wins over a Figma link). Developers have no Figma access; do not ask for it.
   One description can list several things wrong with the same element — fix all of them.
2. Never invent spacing, typography, colours, dimensions or component styles. If a value is
   missing or ambiguous, mark the issue `unresolved` and say exactly what is missing.

## 2. Fix at the right level (fix scope)

Every QA issue has a fix scope. Fix at that level — never lower:

| Scope | Where the fix goes |
|---|---|
| `global` | Design tokens / Tailwind theme / global CSS variables. Then replace hard-coded copies of the old value with the token. |
| `pattern` | The shared component **and** every other implementation of the same kind of element (e.g. every table, including raw `<table>` built outside `DataTable`). |
| `component` | The component's own source file, so all usages change. |
| `instance` | The call site / page file only. Do not modify shared components. |

Forbidden for `global`, `pattern` and `component` scopes: inline `style={}`, `!important`,
page-specific override classes, one-off Tailwind arbitrary values (`p-[13px]`, `text-[#3A3A3A]`).

If you believe the tester picked the wrong scope, do not silently widen or narrow it. Fix at the
given scope and explain your concern in the fix report — or, if fixing at that scope would be
harmful, mark the issue `unresolved` and explain.

## 3. Design system

- Reuse existing design-system components and tokens. Prefer a token over a raw value whenever one
  exists for that value.
- Use logical CSS properties (`ps-`/`pe-`, `ms-`/`me-`, `start`/`end`) so layouts mirror correctly
  in Arabic (RTL).
- <!-- KHDA strict rules go here: allowed font sizes, spacing scale, colour palette, radii,
       component dimensions, etc. -->

## 4. Discipline

- Do not refactor unrelated code. Preserve existing functionality and props APIs.
- Do not claim a visual fix is complete without verifying it (screenshot at the issue's viewport,
  in both LTR and RTL when the app supports Arabic). If you cannot run the app, say
  "not visually verified".
- Report every QA issue as `fixed`, `partially-fixed` or `unresolved` — never skip one.
