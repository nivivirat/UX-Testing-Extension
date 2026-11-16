# KHDA Visual QA — Developer kit

## One-time setup in the KHDA app repo

1. Copy `.claude/skills/khda-qa-fix/` into the repo's `.claude/skills/`.
2. Merge `CLAUDE.md` into the repo's `CLAUDE.md` and add KHDA's strict design rules to section 3.
3. **Recommended — source file:line in QA builds.** Lets the QA extension tell Claude the exact
   file and line of every element the tester picks.

   **Vite + `@vitejs/plugin-react` (Babel):** copy `qa-source-babel-plugin.cjs` to the repo root and:

   ```js
   // vite.config.ts
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     plugins: [
       react({
         babel: {
           plugins: process.env.VITE_QA_SOURCE === 'true' ? ['./qa-source-babel-plugin.cjs'] : [],
         },
       }),
     ],
   });
   ```

   Build the UAT/QA environment with `VITE_QA_SOURCE=true`. Never enable it for production.

   **Vite + `@vitejs/plugin-react-swc` or other bundlers:** use
   [`code-inspector-plugin`](https://www.npmjs.com/package/code-inspector-plugin) — the extension
   reads its `data-insp-path` attribute. Check its docs for enabling it outside `vite dev`.

## Each QA round

1. Unzip the tester's export into `qa/` in the repo, e.g. `qa/KHDA-QA-2026-11-16-UAT-UX1/`.
2. In Claude Code run:

   ```
   /khda-qa-fix qa/KHDA-QA-2026-11-16-UAT-UX1
   ```

3. Review the diff and Claude's summary table, then send the updated `issues.json` back to the
   tester. They import it into the extension, retest, and mark each issue verified or reopened.
