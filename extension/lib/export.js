// Builds the export folder (format v2.0) — designed to be read by Claude Code with as few tokens as
// possible while keeping everything needed to fix the issue correctly:
//   README.md          how to work + fix-level rules ONCE + processing order + "other issues" list
//   issues/<ID>.md     one short, self-sufficient file per open/reopened issue (no JSON dumps)
//   issues.json        slim tracking file (status / resolution write-back), no duplicated details
//   screenshots/       <ID>-element.webp (look first) + <ID>-annotated.webp (context), sized for Claude
// Runs in the service worker and in Node tests.
(function (K) {
  'use strict';
  const X = {};
  X.SCHEMA_VERSION = '2.0';
  X.TOOL_NAME = 'KHDA Visual QA Capture 1.5.0';

  const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

  X.sortIssues = (issues) =>
    [...issues].sort(
      (a, b) =>
        K.SCOPE_ORDER.indexOf(a.scope && a.scope.level) - K.SCOPE_ORDER.indexOf(b.scope && b.scope.level) ||
        (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) ||
        a.id.localeCompare(b.id)
    );

  X.exportFolderName = (settings, date = new Date()) => {
    const p = (n) => String(n).padStart(2, '0');
    const d = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
    const clean = (s) => String(s || '').replace(/[^A-Za-z0-9_-]+/g, '');
    return `${clean(settings.projectCode) || 'KHDA'}-QA-${d}-${clean(settings.environment) || 'ENV'}-${clean(settings.reporter) || 'QA'}`;
  };

  /** Only issues the developer still has to work on are exported in detail. */
  X.isActive = (i) => ['open', 'reopened'].includes(K.normStatus(i.status));

  /** One-line record for everything else (listed as text, no screenshots). */
  X.toBrief = (i) => {
    const r = i.resolution || {};
    return { id: i.id, title: i.title || K.titleFrom(i.description, i.element), status: K.normStatus(i.status), page: (i.page && i.page.route) || '', devNote: r.notes || r.verification || '' };
  };

  // ---------- small formatting helpers ----------
  /** Developers' tools write lists either as arrays or as "a, b, c" text — accept both. */
  const toList = (v) =>
    Array.isArray(v)
      ? v.map(String)
      : v == null || v === ''
        ? []
        : String(v)
            .split(/,\s+(?![^()]*\))/)
            .map((s) => s.trim())
            .filter(Boolean);
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const code = (s) => '`' + String(s).replace(/`/g, "'") + '`';
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
  };
  /** rgb()/rgba() -> #RRGGBB(AA); works without a DOM (service worker / Node). */
  const hex = (v) => {
    const m = String(v || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/i);
    if (!m) return String(v || '');
    const h = (n) => Number(n).toString(16).padStart(2, '0').toUpperCase();
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (a === 0) return 'transparent';
    return '#' + h(m[1]) + h(m[2]) + h(m[3]) + (a < 1 ? h(Math.round(a * 255)) : '');
  };
  const four = (cs, pre, suf = '') => {
    const v = ['top', 'right', 'bottom', 'left'].map((s) => num(cs[`${pre}-${s}${suf}`]));
    return v[0] === v[1] && v[1] === v[2] && v[2] === v[3] ? `${v[0]}` : v[0] === v[2] && v[1] === v[3] ? `${v[0]} ${v[1]}` : v.join(' ');
  };

  /** The element's current look in one line (replaces the old 60-property JSON dump). */
  function currentStyles(el) {
    const cs = (el && el.computedStyles) || {};
    if (!Object.keys(cs).length) return '';
    const b = el.boundingBox || {};
    const parts = [];
    parts.push(`size ${num(b.width)}×${num(b.height)}`);
    const fam = String(cs['font-family'] || '').split(',')[0].replace(/["']/g, '').trim();
    if (cs['font-size']) {
      const lh = !cs['line-height'] ? '' : cs['line-height'] === 'normal' ? '/normal' : `/${num(cs['line-height'])}`;
      parts.push(['font', fam, `${num(cs['font-size'])}${lh}`, cs['font-weight'] || ''].filter(Boolean).join(' '));
    }
    if (cs.color) parts.push(`color ${hex(cs.color)}`);
    const bg = hex(cs['background-color']);
    if (bg && bg !== 'transparent') parts.push(`bg ${bg}`);
    parts.push(`padding ${four(cs, 'padding')}`);
    const m = four(cs, 'margin');
    if (m !== '0') parts.push(`margin ${m}`);
    const bw = four(cs, 'border', '-width');
    if (bw !== '0') parts.push(`border ${bw} ${cs['border-top-style'] || ''} ${hex(cs['border-top-color'])}`.trim());
    const rad = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((c) => num(cs[`border-${c}-radius`]));
    if (rad.some(Boolean)) parts.push(`radius ${rad.every((r) => r === rad[0]) ? rad[0] : rad.join(' ')}`);
    if (/flex|grid/.test(cs.display || '')) {
      parts.push(`${cs.display}${cs['flex-direction'] && cs.display.includes('flex') ? ' ' + cs['flex-direction'] : ''}`);
      if (cs.gap && cs.gap !== 'normal') parts.push(`gap ${cs.gap}`);
      if (cs['align-items'] && cs['align-items'] !== 'normal') parts.push(`align ${cs['align-items']}`);
      if (cs['justify-content'] && cs['justify-content'] !== 'normal') parts.push(`justify ${cs['justify-content']}`);
    }
    if (cs['text-align'] && !/start|left/.test(cs['text-align'])) parts.push(`text-align ${cs['text-align']}`);
    if (cs['box-shadow'] && cs['box-shadow'] !== 'none') parts.push('has box-shadow');
    return parts.join(' · ');
  }

  /** Internal issue -> everything the Markdown/JSON writers need (computed once). */
  X.toExportIssue = (src) => {
    const i = K.ensureDescription({ ...src });
    const el = i.element || null;
    const ext = src._ext || {};
    const level = (i.scope && i.scope.level) || 'instance';
    const marks = ((i._draw && i._draw.shapes) || []).filter((s) => s.type === 'box' || s.type === 'arrow').length;
    return {
      id: i.id,
      title: i.title || K.titleFrom(i.description, el),
      status: K.normStatus(i.status),
      severity: i.severity || 'medium',
      scope: {
        level,
        appliesTo: (i.scope && i.scope.appliesTo) || K.defaultAppliesTo(level, el),
        patternHints: level === 'pattern' ? (i.scope && i.scope.patternHints) || null : null,
        alsoSeenOn: (i.scope && i.scope.alsoSeenOn) || [],
      },
      description: i.description || '',
      flagged: i.flagged || [],
      marks,
      redactions: i.redactionCount || 0,
      page: { url: (i.page && i.page.url) || '', route: (i.page && i.page.route) || '/', lang: (i.page && i.page.lang) || '', dir: (i.page && i.page.dir) || 'ltr' },
      viewport: (i.environment && i.environment.viewport) || null,
      element: el,
      figma: i.figma && i.figma.url ? { url: i.figma.url, nodeId: i.figma.nodeId || null } : null,
      files: {
        md: `issues/${i.id}.md`,
        element: el && ext.element ? `screenshots/${i.id}-element.${ext.element}` : null,
        annotated: ext.annotated ? `screenshots/${i.id}-annotated.${ext.annotated}` : null,
      },
      acceptance: K.defaultAcceptance(i),
      resolution: i.resolution || null,
      history: i.history || [],
      retest: (i.history || [])
        .filter((h) => h.reopenedAt)
        .map((h) => ({ at: h.reopenedAt, note: h.reopenNote || '', previousFix: [h.status, h.rootCause || h.notes || h.verification].filter(Boolean).join(' — '), files: toList(h.filesChanged) })),
    };
  };

  /** Slim tracking file: Claude writes status/resolution back here. Details live in the .md files. */
  X.buildIssuesJson = (ex, settings, exportedAt, briefs = []) => ({
    schemaVersion: X.SCHEMA_VERSION,
    export: { project: settings.projectName, environment: settings.environment, reporter: settings.reporter, exportedAt, tool: X.TOOL_NAME },
    issues: ex.map((x) => ({ id: x.id, title: x.title, status: x.status, severity: x.severity, scope: x.scope.level, page: x.page.route, file: x.files.md, resolution: x.resolution, history: x.history })),
    otherIssues: briefs,
  });

  // ---------- issue Markdown (short and self-sufficient) ----------
  X.buildIssueMd = (x) => {
    const el = x.element;
    const vp = x.viewport;
    const L = [];
    L.push(`# ${x.id} · ${x.title}`, '');
    L.push(
      `**Fix:** ${x.scope.level.toUpperCase()} — ${x.scope.appliesTo} · **Severity:** ${K.severityLabel(x.severity)}` +
        `${x.status === 'reopened' ? ' · **REOPENED**' : ''} · **Page:** ${code(x.page.route)}${vp ? ` at ${vp.width}×${vp.height}` : ''}${x.page.lang ? `, ${x.page.lang}/${x.page.dir.toUpperCase()}` : ''}`,
      ''
    );
    if (x.scope.alsoSeenOn.length) L.push(`Also seen on: ${x.scope.alsoSeenOn.map(code).join(', ')}`, '');

    L.push("## What's wrong", '');
    L.push(x.description.split('\n').map((l) => '> ' + l).join('\n'), '');
    if (x.flagged.length) {
      const vars = (el && el.cssVariables) || {};
      const tok = (v) => Object.entries(vars).filter(([, tv]) => String(tv).trim().toLowerCase() === String(v).trim().toLowerCase()).map(([k]) => k)[0];
      L.push('Flagged in the inspector (current values): ' + x.flagged.map((f) => `${code(f.property)} ${f.current}${tok(f.current) ? ` (= ${code(tok(f.current))})` : ''}`).join(' · '), '');
    }

    if (x.retest.length) {
      L.push(`## Retest feedback — reopened ${x.retest.length}×`, '');
      L.push('The previous fix failed retest. Do **not** repeat it.', '');
      x.retest.forEach((r, n) => {
        L.push(`${n + 1}. ${K.fmtLocal(r.at)} — "${String(r.note).replace(/\s+/g, ' ')}"${r.previousFix ? ` · previous fix: ${r.previousFix}` : ''}${r.files.length ? ` · files: ${r.files.map(code).join(', ')}` : ''}`);
      });
      L.push('');
    }

    L.push('## Where to look', '');
    if (!el) L.push(`- Whole-screen issue — start from the page component for ${code(x.page.route)}.`);
    else {
      L.push(`- Source: ${el.source ? code(el.source) + (el.sourceFrom === 'ancestor-attribute' ? ' (nearest parent)' : '') : 'not captured — use the component and selector'}`);
      if (el.componentChain && el.componentChain.length) {
        const inst = el.instancesOnPage || {};
        L.push(`- Component: ${el.componentChain.slice(-4).map(code).join(' › ')}${inst.sameComponent > 1 ? ` (${inst.sameComponent} on this page)` : ''}${el.componentNamesMinified ? ' — names minified' : ''}`);
      }
      if (el.selector) L.push(`- Selector: ${code(el.selector)}`);
      if (el.classList && el.classList.length) {
        const arb = el.classList.filter((c) => /\[[^\]]+\]/.test(c));
        L.push(`- Classes: ${code(el.classList.slice(0, 14).join(' '))}${arb.length ? ` — hard-coded: ${arb.map(code).join(', ')}` : ''}`);
      }
      const cur = currentStyles(el);
      if (cur) L.push(`- Now: ${cur}`);
      const vars = Object.entries(el.cssVariables || {}).slice(0, 6);
      if (vars.length) L.push(`- Tokens matching current values: ${vars.map(([k, v]) => `${code(k)}=${v}`).join(', ')}`);
      const h = x.scope.patternHints;
      if (h) {
        const parts = [];
        if (h.components && h.components.length) parts.push('components ' + h.components.map(code).join(', '));
        if (h.tags && h.tags.length) parts.push('tags ' + h.tags.map(code).join(', '));
        if (h.roles && h.roles.length) parts.push('roles ' + h.roles.map(code).join(', '));
        if (h.classFragments && h.classFragments.length) parts.push('classes ' + h.classFragments.map(code).join(', '));
        if (parts.length) L.push(`- Find every implementation via: ${parts.join(' · ')}`);
      }
    }
    L.push('');

    L.push('## Evidence', '');
    if (x.files.element) L.push(`- Element (view first): ![element](../${x.files.element})`);
    if (x.files.annotated)
      L.push(
        `- Screen${x.files.element ? ' (open only if the description mentions marks or layout)' : ''}: ![screen](../${x.files.annotated})` +
          ` — ${[x.marks ? 'red numbers = "(1)", "(2)" in the description' : '', el ? 'blue dashed box = the element' : '', x.redactions ? 'pixelated = redacted, ignore' : ''].filter(Boolean).join('; ')}`
      );
    if (x.figma) L.push(`- Figma: ${x.figma.url}${x.figma.nodeId ? ` (node ${x.figma.nodeId})` : ''} — developers may not have access; the description wins.`);
    L.push('');

    L.push('## Done when', '', ...x.acceptance.map((c, n) => `${n + 1}. ${c}`), '');
    L.push('## Fix report', '', '| Status | Fixed at level | Per point | Files changed | Verified |', '|---|---|---|---|---|', '|  |  |  |  |  |', '');
    return L.join('\n');
  };

  // ---------- README (rules once, then the list) ----------
  X.buildReadme = (ex, settings, exportedAt, briefs = []) => {
    const sev = ['critical', 'high', 'medium', 'low']
      .map((s) => [ex.filter((x) => x.severity === s).length, K.severityLabel(s).toLowerCase()])
      .filter(([n]) => n)
      .map(([n, s]) => `${n} ${s}`)
      .join(', ');
    const reopened = ex.filter((x) => x.status === 'reopened').length;
    const L = [
      `# ${settings.projectName} — Visual QA — ${settings.environment} — ${K.fmtLocal(exportedAt).slice(0, 10)}`,
      '',
      `${ex.length} open issue${ex.length === 1 ? '' : 's'} to fix${sev ? ` (${sev})` : ''}${reopened ? `, ${reopened} reopened` : ''}. Reporter ${settings.reporter}.`,
      '',
      '## How to work',
      '',
      "1. Read the repo's `CLAUDE.md` (KHDA UI rules) first.",
      '2. Go through the issues in the table below, in order. A global/pattern fix may already solve a later issue — re-check before editing.',
      '3. For each issue open `issues/<ID>.md`. View the **element** image first; open the **screen** image only when the description refers to marks or layout.',
      '4. Fix everything in "What\'s wrong" at the issue\'s **Fix** level (rules below). Reopened issues: read "Retest feedback" first.',
      '5. Verify at the given page and viewport (LTR and RTL when the app has Arabic). If you cannot run the app, say "not visually verified".',
      '6. Fill the issue\'s **Fix report** and set `status` + `resolution` in `issues.json`. Finish with a table: ID | status | level | files.',
      '',
      '## Fix levels',
      '',
      ...K.SCOPE_ORDER.map((k) => `- **${k.toUpperCase()}** — ${K.SCOPE_INSTRUCTIONS[k].join(' ').replace(/\s+/g, ' ')}`),
      '',
      'Never use inline styles, `!important`, page-level overrides or arbitrary Tailwind values unless the level is INSTANCE.',
      '',
      '## Issues (in order)',
      '',
      '| # | Issue | Fix | Severity | Page |',
      '|---|---|---|---|---|',
      ...ex.map(
        (x, n) =>
          `| ${n + 1} | [${x.id}](issues/${x.id}.md) ${cell(x.title)}${x.status === 'reopened' ? ' **(reopened)**' : ''} | ${x.scope.level}${x.scope.level === 'pattern' ? ` — ${cell(x.scope.appliesTo)}` : ''} | ${K.severityLabel(x.severity)} | ${code(x.page.route)} |`
      ),
      '',
    ];
    if (briefs.length) {
      L.push('## Other issues — reference only, do not work on these', '');
      for (const st of ['fixed', 'partially-fixed', 'unresolved', 'closed']) {
        const bs = briefs.filter((b) => b.status === st);
        if (bs.length) L.push(`- **${K.STATUS_LABEL[st]}:** ${bs.map((b) => `${b.id} ${String(b.title).replace(/\s+/g, ' ')}`).join('; ')}`);
      }
      L.push('');
    }
    return L.join('\n');
  };

  /**
   * issues: internal records of ONE project. getBlob(key) -> Blob|undefined.
   * transform(blob, kind, issue) -> Promise<Blob> (optional; resize/encode for Claude).
   */
  X.buildExportFiles = async (issues, settings, getBlob, { now = new Date(), exportedAt, transform } = {}) => {
    const folder = X.exportFolderName(settings, now);
    const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
    const active = issues.filter(X.isActive);
    const briefs = issues.filter((i) => !X.isActive(i)).map(X.toBrief).sort((a, b) => a.id.localeCompare(b.id));
    const blobs = {};
    const withExt = [];
    for (const i of X.sortIssues(active)) {
      const ext = {};
      for (const kind of ['annotated', 'element']) {
        if (kind === 'element' && !i.element) continue;
        let b = await getBlob(`${i.id}:${kind}`);
        if (b && transform) b = await transform(b, kind, i);
        blobs[`${i.id}:${kind}`] = b;
        if (b) ext[kind] = EXT[b.type] || 'png';
      }
      withExt.push({ ...i, _ext: ext });
    }
    const ex = withExt.map(X.toExportIssue);
    const files = [
      { name: 'README.md', data: X.buildReadme(ex, settings, exportedAt, briefs) },
      { name: 'issues.json', data: JSON.stringify(X.buildIssuesJson(ex, settings, exportedAt, briefs), null, 2) + '\n' },
    ];
    const missing = [];
    for (const x of ex) {
      files.push({ name: x.files.md, data: X.buildIssueMd(x) });
      for (const kind of ['element', 'annotated']) {
        const b = blobs[`${x.id}:${kind}`];
        if (x.files[kind] && b) files.push({ name: x.files[kind], data: b });
        else if (kind === 'annotated' || x.element) missing.push(`${x.id}:${kind}`);
      }
    }
    return { folder, files, missing, detailed: ex.length, listed: briefs.length };
  };

  X.currentStyles = currentStyles; // also used for the Redmine issue description
  K.exporter = X;
})((globalThis.KQA = globalThis.KQA || {}));
