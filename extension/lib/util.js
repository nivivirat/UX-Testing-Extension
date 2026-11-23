// Shared constants and helpers. Classic script: attaches to globalThis.KQA so it works in the
// service worker (importScripts), in content scripts (executeScript files) and in Node tests.
(function (K) {
  'use strict';

  K.CATEGORIES = [
    ['spacing', 'Spacing'],
    ['sizing', 'Sizing'],
    ['typography', 'Typography'],
    ['color', 'Color'],
    ['border', 'Border'],
    ['shadow', 'Shadow'],
    ['alignment', 'Alignment'],
    ['rtl', 'RTL / Arabic'],
    ['component-behavior', 'Component behaviour'],
    ['responsive', 'Responsive'],
    ['content', 'Content'],
    ['other', 'Other'],
  ];
  K.categoryLabel = (c) => (K.CATEGORIES.find(([k]) => k === c) || [c, c || '—'])[1];

  K.SEVERITIES = [
    ['critical', 'Critical'],
    ['high', 'High'],
    ['medium', 'Medium'],
    ['low', 'Low'],
  ];
  K.severityLabel = (s) => (K.SEVERITIES.find(([k]) => k === s) || [s, s])[1];

  // Lifecycle: open → (developer) fixed / partially-fixed / unresolved → (tester retest) closed or reopened.
  // "verified" (v1.0–1.2) means the same as "closed" and is read as closed; stored data is never rewritten.
  K.STATUSES = ['open', 'reopened', 'fixed', 'partially-fixed', 'unresolved', 'closed'];
  K.STATUS_LABEL = { open: 'Open', reopened: 'Reopened', fixed: 'Fixed', 'partially-fixed': 'Partly fixed', unresolved: "Couldn't fix", closed: 'Closed' };
  K.normStatus = (s) => (s === 'verified' ? 'closed' : K.STATUSES.includes(s) ? s : 'open');
  /** Statuses the tester has to look at again. */
  K.RETEST = ['fixed', 'partially-fixed', 'unresolved'];

  K.SCOPE_ORDER = ['global', 'pattern', 'component', 'instance'];
  K.SCOPES = {
    global: { label: 'Global', short: 'Design tokens / theme', desc: 'Wrong everywhere (a colour, font, base size). Fixed in design tokens / theme.' },
    pattern: { label: 'Pattern', short: 'All elements of this kind', desc: 'Every element of this kind (all tables, all buttons), even if built differently.' },
    component: { label: 'Component', short: 'This component everywhere', desc: 'This React component, wherever it is used.' },
    instance: { label: 'Instance', short: 'Only this element', desc: 'Only this one element on this page.' },
  };

  K.SCOPE_INSTRUCTIONS = {
    global: [
      'Fix this at the design-token / theme level (tokens file, Tailwind theme, global CSS variables).',
      'Do not override the value inside individual components. After the change, search the codebase',
      'for hard-coded copies of the old value and replace them with the token.',
    ],
    pattern: [
      'This applies to **every** element of this kind in the application, not only the captured one.',
      '1. Find all implementations using the pattern hints (shared components, raw tags/roles, class fragments).',
      '2. Fix the shared component first.',
      '3. Migrate or fix every other implementation so they all match. If a migration is risky, fix it in place and list it in the fix report.',
      '4. List every file and page affected in the fix report.',
    ],
    component: [
      "Fix this inside the component's own source file so every usage changes.",
      'Do not add props, wrapper classes or overrides at the call site. List the other usages you checked.',
    ],
    instance: [
      'Fix only this occurrence, at the call site / page file. Do not modify the shared component,',
      'because that would change other pages. If you believe the issue actually exists in every usage,',
      'say so in the fix report instead of widening the change.',
    ],
  };

  const SIDES = ['top', 'right', 'bottom', 'left'];
  K.CATEGORY_PROPS = {
    color: ['color', 'background-color', ...SIDES.map((s) => `border-${s}-color`), 'opacity'],
    typography: ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'text-align', 'text-decoration-line', 'white-space'],
    spacing: [...SIDES.map((s) => 'margin-' + s), ...SIDES.map((s) => 'padding-' + s), 'gap', 'row-gap', 'column-gap', 'margin', 'padding'],
    sizing: ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height'],
    border: [
      'border', 'border-radius', 'border-top', 'border-right', 'border-bottom', 'border-left',
      ...SIDES.map((s) => `border-${s}-width`), 'border-top-style',
      'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    ],
    shadow: ['box-shadow'],
    alignment: ['display', 'flex-direction', 'align-items', 'justify-content', 'align-self', 'vertical-align', 'position'],
    rtl: ['direction'],
  };

  /** Which category a CSS property belongs to (first match wins). */
  K.propCategory = (prop) => {
    for (const [cat, props] of Object.entries(K.CATEGORY_PROPS)) if (props.includes(prop)) return cat;
    if (/^border/.test(prop)) return 'border';
    if (/^(margin|padding|gap)/.test(prop)) return 'spacing';
    if (/^font|^text|^line|^letter/.test(prop)) return 'typography';
    return 'other';
  };

  K.DEFAULT_SETTINGS = {
    projectName: 'KHDA Application',
    projectCode: 'KHDA',
    environment: 'UAT',
    reporter: 'UX1',
    autoRedact: true,
    outlineElement: true,
  };

  // ---------- value normalisation (for design-token matching) ----------

  let cx = null;
  function ctx2d() {
    if (cx) return cx;
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      cx = c.getContext('2d', { willReadFrequently: true });
    } else if (typeof OffscreenCanvas !== 'undefined') {
      cx = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
    }
    return cx;
  }
  const hex2 = (n) => n.toString(16).padStart(2, '0').toUpperCase();

  K.normColor = function (v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s || /^(inherit|initial|unset|revert|currentcolor|none)$/i.test(s)) return null;
    if (typeof CSS === 'undefined' || !CSS.supports('color', s)) return null;
    if (/^transparent$/i.test(s)) return 'transparent';
    const c = ctx2d();
    if (!c) return null;
    c.clearRect(0, 0, 1, 1);
    c.fillStyle = '#000';
    c.fillStyle = s;
    c.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = c.getImageData(0, 0, 1, 1).data;
    if (a === 0) return 'transparent';
    return '#' + hex2(r) + hex2(g) + hex2(b) + (a < 255 ? hex2(a) : '');
  };

  K.normLength = function (v, rootPx = 16) {
    if (v == null) return null;
    const s = String(v).trim();
    if (s === '0') return '0px';
    const m = s.match(/^(-?\d*\.?\d+)(px|rem)$/);
    if (!m) return null;
    return `${Math.round(parseFloat(m[1]) * (m[2] === 'rem' ? rootPx : 1) * 100) / 100}px`;
  };

  K.normValue = (v, rootPx = 16) => (v == null ? null : K.normColor(v) ?? K.normLength(v, rootPx) ?? String(v).trim().toLowerCase());

  /** Display form of a computed value: colours as hex, everything else as-is. */
  K.displayValue = (v) => K.normColor(v) ?? (v == null ? '' : String(v));

  const TRIVIAL = new Set(['0px', 'none', 'normal', 'auto', 'transparent', '']);
  K.findTokens = function (value, tokens) {
    if (!value || !tokens || !tokens.length) return [];
    const n = K.normValue(value);
    if (!n || TRIVIAL.has(n)) return [];
    return tokens.filter((t) => t.norm === n).map((t) => t.name);
  };

  // ---------- Figma ----------

  K.parseFigmaUrl = function (url) {
    const s = (url || '').trim();
    if (!s) return { url: '', fileKey: null, nodeId: null, error: null };
    let u;
    try {
      u = new URL(s);
    } catch {
      return { url: s, fileKey: null, nodeId: null, error: 'Not a valid link' };
    }
    if (!/(^|\.)figma\.com$/.test(u.hostname)) return { url: s, fileKey: null, nodeId: null, error: 'Not a figma.com link' };
    const parts = u.pathname.split('/').filter(Boolean);
    let fileKey = null;
    if (['design', 'file', 'proto'].includes(parts[0])) {
      fileKey = parts[1] || null;
      if (parts[2] === 'branch' && parts[3]) fileKey = parts[3];
    }
    const node = u.searchParams.get('node-id');
    const nodeId = node ? node.replace(/-/g, ':') : null;
    let error = null;
    if (!fileKey) error = 'Could not find the file in this link';
    else if (!nodeId) error = 'Link to the exact frame: select it in Figma → Copy link to selection';
    return { url: s, fileKey, nodeId, error };
  };

  // ---------- issue content ----------
  // An issue = one element (or screen) + a free-text description + numbered marks on the screenshot.
  // flagged: [{ property, current }] values the tester clicked in the inspector (optional helper).

  K.issueCategories = (issue) => {
    const out = [];
    for (const f of issue.flagged || []) {
      const c = K.propCategory(f.property);
      if (!out.includes(c)) out.push(c);
    }
    return out.length ? out : ['other'];
  };

  K.elementLabel = (el) => {
    if (!el) return 'Screen';
    const comp = el.componentChain && el.componentChain[el.componentChain.length - 1];
    const names = { th: 'Table header cell', td: 'Table cell', tr: 'Table row', table: 'Table', button: 'Button', a: 'Link', input: 'Input', select: 'Dropdown', textarea: 'Text area', img: 'Image', h1: 'Page title', h2: 'Heading', h3: 'Heading', nav: 'Navigation', li: 'List item', label: 'Label', p: 'Text', span: 'Text', svg: 'Icon', i: 'Icon' };
    return names[el.tag] || comp || `<${el.tag}>`;
  };

  /** Title = first meaningful line of the description, prefixed with what was inspected. */
  K.titleFrom = (desc, el) => {
    const line = String(desc || '')
      .split('\n')
      .map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim())
      .find(Boolean) || '';
    const what = K.elementLabel(el);
    if (!line) return `${what} issue`;
    const t = `${what}: ${line}`;
    return t.length > 90 ? t.slice(0, 87) + '…' : t;
  };

  /** Older saves (v1.0 changes/annotations, v1.1 findings) -> description + flagged. */
  K.ensureDescription = (issue) => {
    if (typeof issue.description === 'string' && issue.description && !issue.findings) return issue;
    const lines = [];
    const flagged = issue.flagged ? [...issue.flagged] : [];
    for (const f of issue.findings || []) {
      if (f.kind === 'property') {
        lines.push(`${f.property}: ${f.current || '?'} → ${f.expected || '?'}${f.note ? ` (${f.note})` : ''}`);
        flagged.push({ property: f.property, current: f.current });
      } else lines.push(`${f.note || ''}${f.expected ? ` → ${f.expected}` : ''}`);
    }
    for (const c of issue.changes || []) lines.push(`${c.property}: ${c.current || '?'} → ${c.expected || '?'}`);
    if (!lines.length && (issue.observed || issue.expected)) lines.push([issue.observed, issue.expected].filter(Boolean).join('\nExpected: '));
    const extra = issue.description ? [issue.description] : [];
    issue.description = [...lines.filter(Boolean), ...extra].join('\n');
    issue.flagged = flagged;
    delete issue.findings;
    return issue;
  };

  // ---------- scope helpers ----------

  const PATTERN_TAGS = new Set(['table', 'thead', 'tbody', 'tr', 'th', 'td', 'button', 'h1', 'h2', 'h3', 'input', 'select', 'textarea', 'label', 'dialog', 'nav']);
  const PATTERN_ROLES = new Set(['grid', 'table', 'columnheader', 'rowheader', 'row', 'cell', 'gridcell', 'button', 'heading', 'tab', 'tablist', 'dialog', 'textbox', 'combobox', 'navigation']);

  K.suggestScope = function (categories, el) {
    const cats = (categories || []).filter((c) => c !== 'other');
    if (cats.length && cats.every((c) => c === 'color' || c === 'typography') && !el) return 'global';
    if (!el) return 'instance';
    if (PATTERN_TAGS.has(el.tag) || PATTERN_ROLES.has(el.role)) return 'pattern';
    if (el.componentChain && el.componentChain.length && ((el.instancesOnPage || {}).sameComponent || 0) > 1) return 'component';
    if (cats.length && cats.every((c) => c === 'color' || c === 'typography')) return 'global';
    return 'instance';
  };

  K.defaultAppliesTo = function (scope, el) {
    if (scope === 'global') return 'Everywhere this value is used in the application';
    if (scope === 'pattern') {
      const t = (el && el.tag) || '';
      const r = el && el.role;
      if (['table', 'thead', 'tbody', 'tr', 'th', 'td'].includes(t) || ['grid', 'table', 'columnheader', 'row', 'cell', 'gridcell'].includes(r)) return 'All data tables in the application';
      if (t === 'button' || r === 'button') return 'All buttons of this type in the application';
      if (/^h[1-6]$/.test(t)) return `All ${t.toUpperCase()} headings in the application`;
      if (['input', 'select', 'textarea', 'label'].includes(t)) return 'All form fields in the application';
      if (t === 'dialog' || r === 'dialog') return 'All dialogs / modals in the application';
      if (r === 'tab' || r === 'tablist') return 'All tabs in the application';
      return 'All elements like this in the application';
    }
    if (scope === 'component') {
      const c = el && el.componentChain && el.componentChain[el.componentChain.length - 1];
      return c ? `Every usage of the ${c} component` : 'Every usage of this component';
    }
    return el ? 'Only this element on this page' : 'Only this screen';
  };

  K.defaultAcceptance = function (issue) {
    const s = issue.scope && issue.scope.level;
    const el = issue.element;
    const fl = issue.flagged || [];
    const out = [];
    if (s === 'global') {
      out.push('The change is made at the design-token / theme level, not per component.');
      const olds = [...new Set(fl.filter((f) => f.current).map((f) => f.current))];
      if (olds.length) out.push(`No hard-coded copies of the old value${olds.length > 1 ? 's' : ''} (${olds.map((v) => '`' + v + '`').join(', ')}) remain in the codebase.`);
    } else if (s === 'pattern') {
      out.push(`Every element covered by "${issue.scope.appliesTo || 'this pattern'}" reflects the change, not only the captured one.`);
      out.push('Implementations not built with the shared component are found and brought in line (or listed in the fix report).');
    } else if (s === 'component') {
      const c = el && el.componentChain && el.componentChain[el.componentChain.length - 1];
      out.push(`The fix is made in the component's own source file${c ? ` (\`${c}\`)` : ''} and appears in every usage.`);
    } else if (s === 'instance') {
      out.push(`Only this element on \`${(issue.page && issue.page.route) || 'this page'}\` changes.`);
      out.push('Shared components are not modified.');
    }
    out.push(`Everything in "What's wrong" is fixed${issue.markCount ? ', including each numbered mark on the screenshot' : ''}.`);
    if (s && s !== 'instance') out.push('No inline styles, `!important`, page-level overrides or arbitrary Tailwind values added.');
    const vp = issue.environment && issue.environment.viewport;
    if (vp) out.push(`Verified at ${vp.width}×${vp.height} in LTR (en) and RTL (ar).`);
    for (const x of issue.acceptanceExtra || []) if (x.trim()) out.push(x.trim());
    return out;
  };

  // ---------- developer resolution → something a tester can use ----------
  /**
   * Turns the developer's `resolution` (written by Claude) into:
   *   points: [{ label, detail, state: 'fixed'|'not'|'partial'|'unknown' }]  — the retest checklist
   *   pages:  ['/projects/pmo/approvals', …]                                — where to check
   *   cause, files[], tokens, verification, notes, level, at
   * Forgiving: point strings come in many shapes ("X (details): fixed", "X: fixed - details",
   * "X: not fixed — why", or no status at all).
   */
  K.parseResolution = (r) => {
    if (!r || typeof r !== 'object') return null;
    const asText = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));
    const raw = Array.isArray(r.points)
      ? r.points
      : Array.isArray(r.problems)
        ? r.problems.map((p) => (typeof p === 'string' ? p : `${p.point || ''}: ${p.status || ''}${p.note ? ' — ' + p.note : ''}`))
        : [];
    const STATE = /:\s*(not fixed|partially fixed|partly fixed|unresolved|skipped|fixed)\b/gi;
    const points = raw.map((line) => {
      const s = String(line).trim();
      let m;
      let last = null;
      STATE.lastIndex = 0;
      while ((m = STATE.exec(s))) last = m;
      let body = s;
      let after = '';
      let state = 'unknown';
      if (last) {
        body = s.slice(0, last.index);
        after = s.slice(last.index + last[0].length).replace(/^\s*[—–,;-]?\s*/, '').trim();
        const w = last[1].toLowerCase();
        state = w === 'fixed' ? 'fixed' : /not|unresolved|skipped/.test(w) ? 'not' : 'partial';
      }
      body = body.trim().replace(/[:\s]+$/, '');
      // "Not fixed: X" / "Fixed — X" written at the start instead of the end
      const lead = body.match(/^(not fixed|partially fixed|partly fixed|fixed)\s*[:—–-]\s*/i);
      if (lead && state === 'unknown') {
        const w = lead[1].toLowerCase();
        state = w === 'fixed' ? 'fixed' : w === 'not fixed' ? 'not' : 'partial';
        body = body.slice(lead[0].length);
      }
      let label = body;
      let detail = '';
      // Split "Label (details…)" only when the bracket closes at the very end of the line.
      let k = -1;
      if (body.endsWith(')')) {
        let depth = 0;
        for (let i = body.length - 1; i >= 0; i--) {
          if (body[i] === ')') depth++;
          else if (body[i] === '(' && --depth === 0) {
            k = i;
            break;
          }
        }
      }
      if (k > 6 && body[k - 1] === ' ') {
        label = body.slice(0, k - 1);
        detail = body.slice(k + 1, -1);
      }
      if (label.length > 110) {
        const full = label;
        const cut = full.slice(0, 100).lastIndexOf(' ');
        label = full.slice(0, cut > 40 ? cut : 100) + '…';
        detail = detail ? `${full} — ${detail}` : full;
      }
      if (after) detail = detail ? `${detail} — ${after}` : after;
      if (state === 'unknown' && /^(fixed|partially-fixed)$/.test(r.status || '')) state = r.status === 'fixed' ? 'fixed' : 'unknown';
      return { label: label || s.slice(0, 100), detail, state };
    });
    // Page paths mentioned in the "affected" / "verification" text (not file paths).
    const hay = `${asText(r.affected || r.affectedUsages)} ${asText(r.verification)}`;
    const pages = [...new Set(hay.match(/(?<![\w./-])\/[a-z][a-z0-9_-]*(?:\/[a-z0-9_:-]+)*/gi) || [])].filter(
      (p) => !/\.(tsx?|jsx?|css|json|woff2?|png|svg|md)$/i.test(p) && !/^\/(fonts|public|src|node_modules|api)\b/i.test(p)
    );
    const files = asText(r.filesChanged)
      .split(/,\s+(?![^()]*\))/)
      .map((f) => f.trim())
      .filter(Boolean);
    return {
      status: r.status || '',
      level: r.fixedAtLevel || '',
      at: r.resolvedAt || r.fixedAt || '',
      cause: r.rootCause || '',
      affected: asText(r.affected || r.affectedUsages),
      points,
      pages: pages.slice(0, 10),
      files,
      tokens: asText(r.tokensUsed),
      verification: asText(r.verification),
      notes: asText(r.notes),
    };
  };

  // ---------- round statistics ----------
  /** Per-round numbers from the event log. Counts issues, so repeated clicks don't inflate them. */
  K.roundStats = (rounds, events) =>
    (rounds || []).map((r) => {
      const ev = (events || []).filter((e) => e.round === r.n);
      const ids = (type, pred = () => true) => new Set(ev.filter((e) => e.type === type && pred(e)).map((e) => e.id)).size;
      const closed = ids('closed');
      const reopened = ids('reopened');
      const exp = ev.filter((e) => e.type === 'exported').pop();
      return {
        n: r.n,
        startedAt: r.startedAt,
        endedAt: r.endedAt || null,
        inProgress: !r.endedAt,
        backfilled: !!r.backfilled,
        created: ids('created'),
        fromDev: ids('devResult'),
        devFixed: ids('devResult', (e) => e.to === 'fixed'),
        devPartly: ids('devResult', (e) => e.to === 'partially-fixed'),
        devCouldnt: ids('devResult', (e) => e.to === 'unresolved'),
        closed,
        reopened,
        passRate: closed + reopened ? Math.round((closed / (closed + reopened)) * 100) : null,
        sent: r.sent ?? (exp ? exp.count : null),
        openAtEnd: r.openAtEnd ?? null,
      };
    });

  // ---------- misc ----------

  K.isoLocal = function (d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    const a = Math.abs(off);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(Math.floor(a / 60))}:${p(a % 60)}`;
  };

  /** "2026-11-16T10:15:22+04:00" -> "2026-11-16 10:15" (keeps the captured local time). */
  K.fmtLocal = (iso) => {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    return m ? `${m[1]} ${m[2]}` : String(iso);
  };

  K.splitList = (s) =>
    String(s || '')
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean);

  K.escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
})((globalThis.KQA = globalThis.KQA || {}));
