// Builds the export folder defined in EXPORT_FORMAT.md (v1.2). Runs in the service worker and in Node tests.
(function (K) {
  'use strict';
  const X = {};
  X.SCHEMA_VERSION = '1.2';
  X.TOOL_NAME = 'KHDA Visual QA Capture 1.3.0';

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

  /** Internal issue record -> issues.json entry. */
  X.toExportIssue = (src) => {
    const i = K.ensureDescription({ ...src });
    const marks = ((i._draw && i._draw.shapes) || []).filter((s) => s.type === 'box' || s.type === 'arrow');
    const flagged = (i.flagged || []).map((f) => ({ property: f.property, current: f.current, category: K.propCategory(f.property) }));
    const categories = K.issueCategories(i);
    const el = i.element
      ? {
          tag: i.element.tag,
          role: i.element.role ?? null,
          text: i.element.text ?? '',
          source: i.element.source ?? null,
          sourceFrom: i.element.sourceFrom ?? null,
          componentChain: i.element.componentChain || [],
          componentNamesMinified: !!i.element.componentNamesMinified,
          selector: i.element.selector ?? null,
          fallbackSelectors: i.element.fallbackSelectors || [],
          classList: i.element.classList || [],
          boundingBox: i.element.boundingBox,
          computedStyles: i.element.computedStyles || {},
          cssVariables: i.element.cssVariables || {},
          instancesOnPage: i.element.instancesOnPage || {},
        }
      : null;
    return {
      id: i.id,
      title: i.title,
      category: categories.length === 1 ? categories[0] : 'multiple',
      categories,
      severity: i.severity,
      status: K.normStatus(i.status),
      scope: {
        level: i.scope.level,
        appliesTo: i.scope.appliesTo || '',
        patternHints: i.scope.level === 'pattern' ? i.scope.patternHints || null : null,
        alsoSeenOn: i.scope.alsoSeenOn || [],
        suggestedByTool: i.scope.suggestedByTool || null,
      },
      description: i.description || '',
      flagged,
      marks: marks.map((s, n) => ({ n: n + 1, type: s.type })),
      // v1.0-compatible views
      observed: i.description || '',
      expected: '',
      annotations: marks.map((s, n) => ({ n: n + 1, type: s.type, note: 'See description' })),
      redactions: i.redactionCount || 0,
      page: i.page,
      environment: i.environment,
      element: el,
      figma: {
        url: (i.figma && i.figma.url) || null,
        fileKey: (i.figma && i.figma.fileKey) || null,
        nodeId: (i.figma && i.figma.nodeId) || null,
        screenshot: null,
      },
      evidence: {
        annotated: `screenshots/${i.id}-annotated.${(src._ext && src._ext.annotated) || 'webp'}`,
        element: el ? `screenshots/${i.id}-element.${(src._ext && src._ext.element) || 'png'}` : null,
      },
      acceptanceCriteria: K.defaultAcceptance(i),
      resolution: i.resolution || null,
      history: i.history || [],
    };
  };

  X.buildIssuesJson = (ex, settings, exportedAt) => {
    const withUrl = ex.find((x) => x.page && x.page.url);
    let baseUrl = null;
    try {
      baseUrl = withUrl ? new URL(withUrl.page.url).origin : null;
    } catch {
      /* ignore */
    }
    return {
      schemaVersion: X.SCHEMA_VERSION,
      export: { project: settings.projectName, environment: settings.environment, baseUrl, reporter: settings.reporter, exportedAt, tool: X.TOOL_NAME },
      issues: ex,
    };
  };

  // ---------- Markdown ----------

  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  const code = (s) => '`' + String(s).replace(/`/g, "'") + '`';
  const table2 = (rows) => '| | |\n|---|---|\n' + rows.map(([k, v]) => `| **${k}** | ${cell(v)} |`).join('\n');

  function headerTable(x) {
    const vp = x.environment && x.environment.viewport;
    return table2([
      ['Severity', K.severityLabel(x.severity)],
      ['Categories', x.categories.map(K.categoryLabel).join(', ')],
      ['Status', x.status],
      ['Page', `${(x.page && x.page.title) || ''} — ${code((x.page && x.page.route) || '/')}`],
      ['URL', (x.page && x.page.url) || ''],
      ['Viewport', vp ? `${vp.width} × ${vp.height}, DPR ${x.environment.devicePixelRatio ?? 1}` : ''],
      ['Language / direction', `${(x.page && x.page.lang) || '—'} / ${((x.page && x.page.dir) || 'ltr').toUpperCase()}`],
      ['Captured', [K.fmtLocal(x.environment && x.environment.capturedAt), x.environment && x.environment.browser, x.environment && x.environment.os].filter(Boolean).join(', ')],
    ]);
  }

  function flaggedTable(x) {
    const cs = (x.element && x.element.computedStyles) || {};
    const vars = (x.element && x.element.cssVariables) || {};
    const rows = x.flagged.map((f) => {
      const toks = Object.entries(vars).filter(([, v]) => K.normValue(v) === K.normValue(f.current)).map(([k]) => code(k));
      return `| ${code(f.property)} | ${cell(f.current || cs[f.property] || '—')} | ${toks.join(', ') || '—'} |`;
    });
    return '| Property | Current value (live) | Token with this value |\n|---|---|---|\n' + rows.join('\n');
  }

  function whereToLook(x) {
    const el = x.element;
    if (!el) return `No single element was selected — this is a whole-screen issue.\nUse the page route ${code((x.page && x.page.route) || '/')} and the screenshots to locate the page component.`;
    const rows = [];
    if (el.source) {
      let v = code(el.source);
      if (el.sourceFrom === 'ancestor-attribute') v += ' (nearest stamped ancestor)';
      if (x.scope.level === 'instance') v += ' ← call site, edit here';
      rows.push(['Source (captured element)', v]);
    } else rows.push(['Source (captured element)', '_Not captured — the app build has no `data-source` attributes. Use the component chain and selectors._']);
    if (el.componentChain.length) {
      let v = el.componentChain.map(code).join(' → ');
      if (el.componentNamesMinified) v += ' _(names look minified — production build)_';
      if (x.scope.level === 'instance') v += ' (do not edit shared components)';
      rows.push(['Component chain', v]);
    }
    if (el.classList.length) {
      let v = code(el.classList.join(' '));
      const arb = el.classList.filter((c) => /\[[^\]]+\]/.test(c));
      if (arb.length) v += ` ← hard-coded arbitrary value${arb.length > 1 ? 's' : ''}: ${arb.map(code).join(', ')}`;
      rows.push(['Classes on element', v]);
    }
    const inst = el.instancesOnPage || {};
    if (inst.sameComponent != null) rows.push(['Same component on this page', `${inst.sameComponent} instance${inst.sameComponent === 1 ? '' : 's'}`]);
    if (inst.sameClassList != null) rows.push(['Same tag + class list on this page', `${inst.sameClassList} element${inst.sameClassList === 1 ? '' : 's'}`]);
    if (x.scope.level === 'pattern' && x.scope.patternHints) {
      const h = x.scope.patternHints;
      const parts = [];
      if (h.tags && h.tags.length) parts.push('tags ' + h.tags.map(code).join(', '));
      if (h.roles && h.roles.length) parts.push('roles ' + h.roles.map(code).join(', '));
      if (h.components && h.components.length) parts.push('components ' + h.components.map(code).join(', '));
      if (h.classFragments && h.classFragments.length) parts.push('class fragments ' + h.classFragments.map(code).join(', '));
      if (parts.length) rows.push(['Pattern hints', parts.join(' · ')]);
    }
    const vars = Object.entries(el.cssVariables || {});
    if (vars.length) rows.push(['Design tokens matching current values', vars.map(([k, v]) => `${code(k)} = ${code(v)}`).join(' · ')]);
    if (el.selector) rows.push(['Selector', code(el.selector)]);
    if (el.fallbackSelectors.length) rows.push(['Fallback selectors', el.fallbackSelectors.map(code).join(' · ')]);
    return table2(rows);
  }

  function evidence(x) {
    const e = x.evidence;
    const out = [`Annotated screenshot${x.marks.length ? ' (numbered marks are referred to in "What\'s wrong")' : ''}:`, '', `![Annotated screenshot](../${e.annotated})`, ''];
    if (e.element) out.push('Selected element (crop):', '', `![Element crop](../${e.element})`, '');
    if (x.element) out.push('The selected element is outlined with a dashed blue box on the annotated screenshot.');
    if (x.redactions) out.push('', `Sensitive data was redacted (pixelated) in ${x.redactions} area${x.redactions === 1 ? '' : 's'} before export — ignore those blocks.`);
    return out.join('\n');
  }

  function fixReport(x) {
    const r = x.resolution;
    const v = (k) => (r && r[k] != null ? (Array.isArray(r[k]) ? r[k].join(', ') : typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k])) : '');
    const rows = [
      ['Status', r ? v('status') : 'fixed / partially-fixed / unresolved'],
      ['Fixed at level', v('fixedAtLevel')],
      ['Per point', r ? v('problems') : 'one line per point in "What\'s wrong": fixed / not fixed'],
      ['Root cause', v('rootCause')],
      ['Files changed', v('filesChanged')],
      ['Affected usages / pages', v('affectedUsages')],
      ['Tokens used', v('tokensUsed')],
      ['Verification', v('verification')],
      ['Notes', v('notes')],
    ];
    return (r ? '' : '_To be completed by Claude._\n\n') + table2(rows);
  }

  X.buildIssueMd = (x) => {
    const scope = K.SCOPES[x.scope.level];
    const L = [];
    L.push(`# ${x.id} — ${x.title}`, '', headerTable(x), '');
    L.push(`## Fix scope: ${scope.label.toUpperCase()} — ${x.scope.appliesTo || scope.short}`, '');
    L.push(K.SCOPE_INSTRUCTIONS[x.scope.level].map((l) => '> ' + l).join('\n'), '');
    if (x.scope.alsoSeenOn.length) L.push(`Tester also saw this on: ${x.scope.alsoSeenOn.map(code).join(', ')}`, '');
    if (x.scope.suggestedByTool && x.scope.suggestedByTool !== x.scope.level) L.push(`Note: the tool suggested \`${x.scope.suggestedByTool}\`; the tester chose \`${x.scope.level}\`.`, '');
    L.push("## What's wrong", '');
    L.push('The tester\'s description. Fix **everything** it mentions on this element (numbers like "(1)" refer to marks on the screenshot).', '');
    L.push(x.description.split('\n').map((l) => '> ' + l).join('\n'), '');
    if (x.flagged.length) L.push('Values the tester flagged in the inspector:', '', flaggedTable(x), '');
    L.push('## Visual evidence', '', evidence(x), '');
    L.push('## Where to look in code', '', whereToLook(x), '');
    L.push('## Figma reference', '');
    L.push(x.figma.url ? `[Open Figma frame](${x.figma.url})${x.figma.nodeId ? ` (node \`${x.figma.nodeId}\`)` : ''}` : '_No Figma frame linked._', '');
    L.push('Developers have no Figma access — use the description and screenshots as the design source of truth.', '');
    L.push('## Acceptance criteria', '', ...x.acceptanceCriteria.map((c, n) => `${n + 1}. ${c}`), '');
    L.push('## Captured element data', '');
    if (x.element) L.push('<details>', '<summary>JSON</summary>', '', '```json', JSON.stringify(x.element, null, 2), '```', '', '</details>', '');
    else L.push('_No element selected._', '');
    L.push('## Fix report', '', fixReport(x), '');
    return L.join('\n');
  };

  X.buildReadme = (ex, settings, exportedAt) => {
    const sev = ['critical', 'high', 'medium', 'low']
      .map((s) => [ex.filter((x) => x.severity === s).length, K.severityLabel(s).toLowerCase()])
      .filter(([n]) => n)
      .map(([n, s]) => `${n} ${s}`)
      .join(', ');
    const open = ex.filter((x) => ['open', 'reopened'].includes(x.status)).length;
    const L = [
      `# ${settings.projectCode || 'KHDA'} Visual QA Report — ${settings.environment} — ${K.fmtLocal(exportedAt).slice(0, 10)}`,
      '',
      '| | |',
      '|---|---|',
      `| **Project** | ${cell(settings.projectName)} |`,
      `| **Environment** | ${cell(settings.environment)} |`,
      `| **Reporter** | ${cell(settings.reporter)} |`,
      `| **Exported** | ${K.fmtLocal(exportedAt)} |`,
      `| **Issues** | ${ex.length} issues, ${open} not yet fixed${sev ? ` (${sev})` : ''} |`,
      `| **Format** | KHDA Visual QA export v${X.SCHEMA_VERSION} — see \`issues.json\` |`,
      '',
      '## For Claude: how to process this report',
      '',
      "1. Read the project's `CLAUDE.md` (KHDA UI rules) before anything else.",
      '2. Process issues **in the order below** — grouped by fix scope, highest first. A global/pattern',
      '   fix may already resolve a later issue; re-check each issue before editing.',
      '3. For each issue, open `issues/<ID>.md`, look at every linked screenshot, and fix **everything**',
      '   in its "What\'s wrong" section. Follow its **Fix scope** exactly — fix at that level, never lower.',
      '4. After each issue, fill in its **Fix report** (one line per point) and update `status` +',
      '   `resolution` in `issues.json`.',
      '5. Finish with a summary table: ID | status | level fixed at | files changed.',
      '',
      'Developers do not have Figma access. Treat the descriptions and screenshots as the',
      'design source of truth.',
      '',
      '## Issues — processing order',
    ];
    const titles = { global: 'Global (design tokens / theme)', pattern: 'Pattern (all elements of a kind)', component: 'Component', instance: 'Instance (this element only)' };
    K.SCOPE_ORDER.forEach((lvl, n) => {
      const xs = ex.filter((x) => x.scope.level === lvl);
      L.push('', `### ${n + 1}. ${titles[lvl]}`, '');
      if (!xs.length) return L.push('_None._');
      const mid = lvl === 'instance' ? 'Page' : 'Applies to';
      L.push(`| ID | Title | ${mid} | Severity | Status |`, '|---|---|---|---|---|');
      for (const x of xs) {
        const m = lvl === 'instance' ? code((x.page && x.page.route) || '/') : x.scope.appliesTo || K.SCOPES[lvl].short;
        L.push(`| [${x.id}](issues/${x.id}.md) | ${cell(x.title)} | ${cell(m)} | ${K.severityLabel(x.severity)} | ${x.status} |`);
      }
    });
    L.push('');
    return L.join('\n');
  };

  /** issues: internal records. getBlob(key) -> Blob|undefined. */
  X.buildExportFiles = async (issues, settings, getBlob, { now = new Date(), exportedAt } = {}) => {
    const folder = X.exportFolderName(settings, now);
    const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
    // Two images per issue: annotated screenshot + element crop. Extensions follow the stored type
    // (older issues were saved as PNG).
    const blobs = {};
    const withExt = [];
    for (const i of X.sortIssues(issues)) {
      const ext = {};
      for (const kind of ['annotated', 'element']) {
        const b = await getBlob(`${i.id}:${kind}`);
        blobs[`${i.id}:${kind}`] = b;
        if (b) ext[kind] = EXT[b.type] || 'png';
      }
      withExt.push({ ...i, _ext: ext });
    }
    const ex = withExt.map(X.toExportIssue);
    const files = [
      { name: 'README.md', data: X.buildReadme(ex, settings, exportedAt) },
      { name: 'issues.json', data: JSON.stringify(X.buildIssuesJson(ex, settings, exportedAt), null, 2) + '\n' },
    ];
    const missing = [];
    for (const x of ex) {
      files.push({ name: `issues/${x.id}.md`, data: X.buildIssueMd(x) });
      for (const kind of ['annotated', 'element']) {
        const path = x.evidence[kind];
        if (!path) continue;
        const blob = blobs[`${x.id}:${kind}`];
        if (blob) files.push({ name: path, data: blob });
        else missing.push(path);
      }
    }
    return { folder, files, missing };
  };

  K.exporter = X;
})((globalThis.KQA = globalThis.KQA || {}));
