// KHDA Visual QA — floating toolbar, Dev Mode-style inspector and in-page issue editor.
// Runs in the extension's isolated world. Everything lives in one closed shadow root on top of the
// page, so the page keeps its full width (no side panel) and page CSS cannot leak in.
(() => {
  'use strict';
  if (window.__kqaWidget) {
    window.__kqaWidget.show();
    return;
  }
  const K = window.KQA;
  if (!K || !K.WIDGET_CSS || !K.render) return;
  const R = K.render;
  const esc = K.escHtml;

  // ======================================================================= messaging
  function send(type, data = {}) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type, ...data }, (res) => {
          const le = chrome.runtime.lastError;
          if (le) return reject(new Error(le.message));
          if (!res) return reject(new Error('No response from the extension'));
          res.ok ? resolve(res.result) : reject(new Error(res.error));
        });
      } catch {
        reject(new Error('The extension was reloaded — refresh this page.'));
      }
    });
  }

  const frames = (n = 2) => new Promise((r) => { const step = () => (--n <= 0 ? r() : requestAnimationFrame(step)); requestAnimationFrame(step); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const num = (v) => parseFloat(v) || 0;
  const r1 = (n) => Math.round(n * 10) / 10;
  const uid = () => 'f' + Math.random().toString(36).slice(2, 9);

  // ======================================================================= page data
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const CAPTURE_PROPS = [
    'display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    ...SIDES.map((s) => 'margin-' + s), ...SIDES.map((s) => 'padding-' + s),
    'gap', 'row-gap', 'column-gap', 'flex-direction', 'align-items', 'justify-content', 'align-self', 'text-align', 'vertical-align',
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'text-decoration-line', 'white-space',
    'color', 'background-color', 'opacity',
    ...SIDES.map((s) => `border-${s}-width`), 'border-top-style', ...SIDES.map((s) => `border-${s}-color`),
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'box-shadow', 'overflow', 'direction', 'z-index',
  ];
  const TOKEN_PROPS = [
    'color', 'background-color', ...SIDES.map((s) => `border-${s}-color`), 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-family',
    ...SIDES.map((s) => 'margin-' + s), ...SIDES.map((s) => 'padding-' + s), 'gap', 'row-gap', 'column-gap',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    ...SIDES.map((s) => `border-${s}-width`), 'box-shadow', 'width', 'height',
  ];
  const TRIVIAL = new Set(['0px', 'none', 'normal', 'auto', 'transparent', '400', '']);
  const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  /** Design tokens = CSS custom properties resolvable on :root. */
  function collectTokens() {
    const names = new Set();
    const walk = (rules) => {
      for (const r of rules) {
        if (names.size > 4000) return;
        if (r.style) for (let i = 0; i < r.style.length; i++) if (r.style[i].startsWith('--')) names.add(r.style[i]);
        if (r.cssRules) walk(r.cssRules);
      }
    };
    for (const sh of [...document.styleSheets, ...(document.adoptedStyleSheets || [])]) {
      try {
        walk(sh.cssRules);
      } catch {
        /* cross-origin stylesheet */
      }
    }
    const cs = getComputedStyle(document.documentElement);
    for (let i = 0; i < cs.length; i++) if (cs[i].startsWith('--')) names.add(cs[i]);
    const root = rootPx();
    const out = [];
    for (const name of names) {
      const value = cs.getPropertyValue(name).trim();
      if (!value || value.length > 160) continue;
      out.push({ name, value, norm: K.normValue(value, root) });
    }
    return out;
  }
  function tokenIndex(tokens) {
    const m = new Map();
    for (const t of tokens) {
      if (!t.norm || TRIVIAL.has(t.norm)) continue;
      if (!m.has(t.norm)) m.set(t.norm, []);
      m.get(t.norm).push(t);
    }
    return m;
  }

  function implicitRole(el) {
    const r = el.getAttribute('role');
    if (r) return r.split(/\s+/)[0];
    const t = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(t)) return 'heading';
    if (t === 'a') return el.hasAttribute('href') ? 'link' : null;
    if (t === 'th') return el.getAttribute('scope') === 'row' ? 'rowheader' : 'columnheader';
    if (t === 'input') {
      const ty = (el.type || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'image'].includes(ty)) return 'button';
      if (ty === 'checkbox' || ty === 'radio') return ty;
      if (ty === 'range') return 'slider';
      return 'textbox';
    }
    const map = { button: 'button', nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', aside: 'complementary', table: 'table', thead: 'rowgroup', tbody: 'rowgroup', tr: 'row', td: 'cell', ul: 'list', ol: 'list', li: 'listitem', dialog: 'dialog', form: 'form', select: 'combobox', textarea: 'textbox', img: 'img' };
    return map[t] || null;
  }
  function accName(el) {
    const lab = el.getAttribute('aria-label');
    if (lab) return lab.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim();
      if (t) return t;
    }
    if (el.labels && el.labels.length) return el.labels[0].textContent.trim();
    const alt = el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('placeholder');
    if (alt) return alt.trim();
    return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  }
  const relPath = (p) => {
    p = String(p).replace(/\\/g, '/');
    const i = p.lastIndexOf('/src/');
    return i >= 0 ? p.slice(i + 1) : p.replace(/^\.?\//, '');
  };
  const attrSel = (name, val) => `[${name}="${String(val).replace(/"/g, '\\"')}"]`;

  /** JSX source location stamped by a build plugin. */
  function sourceFromAttrs(el) {
    const a = el.closest('[data-source],[data-insp-path],[data-inspector-relative-path],[data-lov-id]');
    if (!a) return null;
    const onSelf = a === el;
    const ds = a.dataset;
    if (ds.source) return { value: relPath(ds.source), sel: attrSel('data-source', ds.source), onSelf };
    if (ds.inspPath || ds.lovId) {
      const raw = ds.inspPath || ds.lovId;
      const parts = raw.split(':');
      if (ds.inspPath) parts.pop(); // path:line:col:tag
      parts.pop(); // col
      const line = parts.pop();
      return { value: relPath(parts.join(':')) + ':' + line, sel: attrSel(ds.inspPath ? 'data-insp-path' : 'data-lov-id', raw), onSelf };
    }
    const p = ds.inspectorRelativePath;
    return { value: relPath(p) + ':' + (ds.inspectorLine || '?'), sel: attrSel('data-inspector-relative-path', p), onSelf };
  }

  const GENERATED_ID = /\d{3,}|^:|^(radix|headlessui|mui|react-|rc-|downshift|mantine)/i;
  function cssPath(el) {
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1 && e !== document.body && e !== document.documentElement && parts.length < 6) {
      if (e.id && !GENERATED_ID.test(e.id)) {
        parts.unshift('#' + CSS.escape(e.id));
        break;
      }
      let p = e.tagName.toLowerCase();
      const par = e.parentElement;
      if (par) {
        const sib = [...par.children].filter((c) => c.tagName === e.tagName);
        if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(e) + 1})`;
      }
      parts.unshift(p);
      e = par;
    }
    return parts.join(' > ');
  }
  function selectors(el, src, role, name) {
    const out = [];
    if (src && src.onSelf) out.push(src.sel);
    for (const a of ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa']) {
      const v = el.getAttribute(a);
      if (v) out.push(attrSel(a, v));
    }
    if (el.id && !GENERATED_ID.test(el.id)) out.push('#' + CSS.escape(el.id));
    if (role && name) out.push(`role=${role}[name="${name.slice(0, 60).replace(/"/g, '\\"')}"]`);
    out.push(cssPath(el));
    return [...new Set(out)];
  }
  const UTILITY =
    /^(?:[a-z0-9-]+:)*-?(?:[mp][trblxyse]?-|(?:min-|max-)?[wh]-|size-|text-|font-|bg-|border|rounded|shadow|ring|outline|leading-|tracking-|gap-|space-|flex|grid|col-|row-|items-|justify-|content-|self-|place-|order-|z-|top-|left-|right-|bottom-|inset|overflow|cursor-|transition|duration-|ease-|opacity-|fill-|stroke-|object-|align-|whitespace-|break-|truncate$|underline$|uppercase$|lowercase$|capitalize$|italic$|sr-only$|block$|inline|hidden$|absolute$|relative$|fixed$|sticky$|static$|visible$|invisible$|container$|divide|translate|scale-|rotate-|animate-|select-|pointer-|decoration-|line-clamp|aspect-|basis-|grow|shrink|antialiased$|group$|peer$)/;
  function semanticClasses(el) {
    if (!el || !el.classList) return [];
    return [...el.classList]
      .filter((c) => !UTILITY.test(c) && !/^(sc-|css-|jsx-|emotion-)/.test(c) && c.length > 2)
      .map((c) => (/[0-9]/.test(c) ? c.replace(/(__|_|-)[A-Za-z0-9]{5,}$/, '') : c));
  }
  function patternHints(el, tag, role) {
    const tags = [tag];
    const roles = role ? [role] : [];
    const table = el.closest('table,[role=grid],[role=table],[role=treegrid]');
    if (table && table !== el) {
      tags.push(table.tagName.toLowerCase());
      const tr = implicitRole(table);
      if (tr) roles.push(tr);
    }
    if (tag === 'li') {
      const list = el.closest('ul,ol');
      if (list) tags.push(list.tagName.toLowerCase());
    }
    const frags = [...semanticClasses(el), ...semanticClasses(el.parentElement), ...semanticClasses(table)];
    return { tags: [...new Set(tags)], roles: [...new Set(roles)], classFragments: [...new Set(frags)].slice(0, 6) };
  }

  /** Suggested redactions: filled inputs, emails, UAE phone numbers, Emirates IDs. */
  function redactRects() {
    const out = [];
    const vw = innerWidth;
    const vh = innerHeight;
    const vis = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    const push = (r, reason) => out.length < 200 && out.push({ x: r.left, y: r.top, w: r.width, h: r.height, reason });
    document.querySelectorAll('input,textarea').forEach((i) => {
      const t = (i.type || '').toLowerCase();
      if (['button', 'submit', 'reset', 'checkbox', 'radio', 'hidden', 'range', 'color', 'file', 'image'].includes(t) || !i.value) return;
      const r = i.getBoundingClientRect();
      if (vis(r)) push(r, t === 'password' ? 'password field' : 'input value');
    });
    const PATTERNS = [
      [/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'email'],
      [/\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/g, 'Emirates ID'],
      [/(?:\+971|00971|\b0)[\s-]?(?:5\d|[234679])[\s-]?\d{3}[\s-]?\d{4}\b/g, 'phone number'],
    ];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n = 0;
    while (walker.nextNode() && n++ < 20000 && out.length < 200) {
      const node = walker.currentNode;
      const text = node.nodeValue;
      if (!text || text.length < 6) continue;
      const parent = node.parentElement;
      if (!parent || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(parent.tagName)) continue;
      for (const [re, reason] of PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          for (const r of range.getClientRects()) if (vis(r)) push(r, reason);
        }
      }
    }
    return out;
  }

  function pageInfo(el) {
    const route = location.hash.startsWith('#/') ? location.hash.slice(1).split('?')[0] : location.pathname;
    const scopeEl = el || document.documentElement;
    return {
      url: location.href,
      route,
      title: document.title,
      lang: ((scopeEl.closest('[lang]') || {}).getAttribute?.('lang') || document.documentElement.lang || '').toLowerCase() || null,
      dir: getComputedStyle(el || document.body || document.documentElement).direction,
    };
  }

  async function envInfo() {
    const ua = navigator.userAgent;
    const edge = ua.match(/Edg\/(\d+)/);
    const chrome = ua.match(/Chrome\/(\d+)/);
    const browser = edge ? 'Edge ' + edge[1] : chrome ? 'Chrome ' + chrome[1] : 'Chrome';
    let os = navigator.platform || '';
    try {
      const h = await navigator.userAgentData.getHighEntropyValues(['platformVersion']);
      if (h.platform === 'Windows') os = parseInt(h.platformVersion, 10) >= 13 ? 'Windows 11' : 'Windows 10';
      else if (h.platform === 'macOS') os = 'macOS ' + h.platformVersion;
      else os = h.platform || os;
    } catch {
      /* keep fallback */
    }
    return { browser, os };
  }

  /** Everything captured about one element (synchronous part). */
  function describe(el, tokens) {
    const cs = getComputedStyle(el);
    const computedStyles = {};
    for (const p of CAPTURE_PROPS) computedStyles[p] = cs.getPropertyValue(p);
    const tag = el.tagName.toLowerCase();
    const role = implicitRole(el);
    const name = accName(el);
    const src = sourceFromAttrs(el);
    const idx = tokenIndex(tokens);
    const root = rootPx();
    const cssVariables = {};
    const matchedTokens = {};
    for (const p of TOKEN_PROPS) {
      const m = idx.get(K.normValue(cs.getPropertyValue(p), root));
      if (!m) continue;
      matchedTokens[p] = m.slice(0, 3).map((t) => t.name);
      for (const t of m.slice(0, 3)) cssVariables[t.name] = t.value;
    }
    let sameClassList = 1;
    if (el.className && typeof el.className === 'string') sameClassList = [...document.getElementsByTagName(el.tagName)].filter((x) => x.className === el.className).length;
    return {
      tag, role, name,
      text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      classList: [...el.classList],
      computedStyles,
      sourceAttr: src ? { value: src.value, onSelf: src.onSelf } : null,
      selectors: selectors(el, src, role, name),
      cssVariables, matchedTokens, sameClassList,
      hints: patternHints(el, tag, role),
    };
  }

  async function reactFor(el) {
    const token = Math.random().toString(36).slice(2, 10);
    el.setAttribute('data-khda-qa-pick', token);
    try {
      return await send('reactInfo', { token });
    } catch {
      return null;
    } finally {
      el.removeAttribute('data-khda-qa-pick');
    }
  }

  function buildElement(d, react, rect) {
    const r = react || {};
    let source = null;
    let sourceFrom = null;
    if (d.sourceAttr && d.sourceAttr.onSelf) [source, sourceFrom] = [d.sourceAttr.value, 'data-attribute'];
    else if (r.source) [source, sourceFrom] = [r.source, 'react-debug'];
    else if (d.sourceAttr) [source, sourceFrom] = [d.sourceAttr.value, 'ancestor-attribute'];
    return {
      tag: d.tag, role: d.role, text: d.text, source, sourceFrom,
      componentChain: r.componentChain || [],
      componentNamesMinified: !!r.minified,
      selector: d.selectors[0] || null,
      fallbackSelectors: d.selectors.slice(1),
      classList: d.classList,
      boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
      computedStyles: d.computedStyles,
      cssVariables: d.cssVariables,
      matchedTokens: d.matchedTokens,
      instancesOnPage: { sameComponent: r.react ? r.sameComponent : null, sameClassList: d.sameClassList },
    };
  }

  // ======================================================================= UI shell
  const IC = {
    inspect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3l14 7-6 2-2 6z"/></svg>',
    screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  };

  const host = document.createElement('kqa-root');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${K.WIDGET_CSS}</style>
  <div class="ui">
    <div class="ov" id="ov"></div>
    <div class="hcard" id="hcard" hidden></div>
    <div class="tip" id="tip" hidden></div>
    <div class="panel" id="insp" hidden style="top:16px;right:16px"></div>
    <div class="panel" id="list" hidden style="right:20px;bottom:72px"></div>
    <div id="modal" hidden></div>
    <div id="dlg" hidden></div>
    <div class="dock" id="dock">
      <div class="grip" title="Drag to move">⋮⋮</div>
      <button class="dbtn" data-act="inspect" aria-pressed="false" title="Inspect elements — like Figma Dev Mode">${IC.inspect}<span>Inspect</span></button>
      <button class="dbtn" data-act="screen" title="Report a whole-screen issue">${IC.screen}</button>
      <div class="dsep"></div>
      <button class="dbtn" data-act="issues" aria-pressed="false" title="Issues, export and settings">${IC.list}<span class="count" id="count">0</span></button>
      <button class="dbtn" data-act="hide" title="Hide toolbar (Alt+Shift+Q shows it again)">${IC.close}</button>
    </div>
    <div class="toast" id="toast" hidden></div>
  </div>`;
  document.documentElement.appendChild(host);
  const $ = (id) => shadow.getElementById(id);

  // Keep typing inside the toolbar away from the page's own keyboard shortcuts.
  for (const t of ['keydown', 'keyup', 'keypress']) shadow.addEventListener(t, (e) => e.stopPropagation());

  let toastTimer = 0;
  function toast(msg, kind = '', ms = 3500) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  function setPressed(act, on) {
    const b = shadow.querySelector(`.dock [data-act="${act}"]`);
    if (b) b.setAttribute('aria-pressed', String(on));
  }

  /** Drag an element by a handle; switches it to left/top positioning. */
  function draggable(box, handleSel, onMove) {
    box.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest(handleSel);
      if (!handle || e.target.closest('button,input,select,textarea,label') || e.button !== 0) return;
      const r = box.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const x = Math.min(Math.max(0, ev.clientX - dx), innerWidth - 60);
        const y = Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40);
        Object.assign(box.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
        if (onMove) onMove();
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      e.preventDefault();
    });
  }
  draggable($('dock'), '.grip', () => placeTip());
  draggable($('insp'), '[data-drag]');
  draggable($('list'), '[data-drag]');

  let state = { settings: K.DEFAULT_SETTINGS, issues: [] };
  async function refresh() {
    try {
      state = await send('state');
    } catch (e) {
      toast(e.message, 'err');
    }
    $('count').textContent = state.issues.length;
    if (!$('list').hidden) renderList();
  }

  // ======================================================================= inspector
  const I = { on: false, paused: false, hover: null, sel: null, selData: null, selReact: null, selReactP: null, flags: new Map(), stack: [], alt: false, mouse: { x: 0, y: 0 }, tokens: [], raf: 0 };
  const BLOCK = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu', 'touchstart', 'auxclick'];
  const isOurs = (e) => e.composedPath().includes(host);

  function deepEl(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot && el !== host) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el && el !== host && el !== document.documentElement ? el : null;
  }

  function listen(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    window[f]('mousemove', onMove, true);
    window[f]('click', onClick, true);
    for (const t of BLOCK) window[f](t, onBlock, true);
    window[f]('keydown', onKey, true);
    window[f]('keyup', onKeyUp, true);
    window[f]('scroll', schedule, true);
    window[f]('resize', schedule, true);
  }

  function startInspect() {
    if (I.on) return;
    I.on = true;
    I.paused = false;
    I.tokens = collectTokens();
    listen(true);
    setPressed('inspect', true);
    placeTip();
  }
  function stopInspect() {
    if (I.on) listen(false);
    I.on = false;
    I.hover = I.sel = null;
    I.flags = new Map();
    $('insp').hidden = true;
    $('hcard').hidden = true;
    $('tip').hidden = true;
    $('ov').innerHTML = '';
    setPressed('inspect', false);
  }
  function pauseInspect() {
    if (!I.on || I.paused) return;
    I.paused = true;
    listen(false);
    $('ov').innerHTML = '';
    $('hcard').hidden = true;
    $('tip').hidden = true;
  }
  function resumeInspect() {
    if (!I.on || !I.paused) return;
    I.paused = false;
    listen(true);
    placeTip();
    schedule();
  }

  function onMove(e) {
    I.mouse = { x: e.clientX, y: e.clientY };
    I.alt = e.altKey;
    I.hover = isOurs(e) ? null : deepEl(e.clientX, e.clientY);
    schedule();
  }
  function onBlock(e) {
    if (isOurs(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  function onClick(e) {
    if (isOurs(e)) return;
    onBlock(e);
    const el = I.hover || deepEl(e.clientX, e.clientY);
    if (el) select(el);
  }
  function onKey(e) {
    const target = e.composedPath()[0];
    if (isOurs(e) && target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    if (e.key === 'Alt') {
      I.alt = true;
      stop();
      schedule();
    } else if (e.key === 'Escape') {
      stop();
      if (I.sel) deselect();
      else stopInspect();
    } else if (I.sel && e.key === 'ArrowUp') {
      stop();
      goParent();
    } else if (I.sel && e.key === 'ArrowDown') {
      stop();
      goChild();
    } else if (I.sel && e.key === 'Enter') {
      stop();
      report(true);
    }
  }
  function onKeyUp(e) {
    if (e.key === 'Alt') {
      I.alt = false;
      e.preventDefault();
      schedule();
    }
  }

  function select(el, keepStack = false) {
    I.sel = el;
    if (!keepStack) I.stack = [];
    I.flags = new Map();
    I.selData = describe(el, I.tokens);
    I.selReact = null;
    I.selReactP = reactFor(el).then((r) => {
      if (I.sel === el) {
        I.selReact = r;
        renderPanelHeader();
      }
      return r;
    });
    renderPanel();
    placeTip();
    schedule();
  }
  function deselect() {
    I.sel = null;
    I.flags = new Map();
    $('insp').hidden = true;
    placeTip();
    schedule();
  }
  function goParent() {
    const p = I.sel && I.sel.parentElement;
    if (!p || p === document.documentElement) return;
    I.stack.push(I.sel);
    select(p, true);
  }
  function goChild() {
    if (!I.stack.length) return;
    select(I.stack.pop(), true);
  }

  function placeTip() {
    const tip = $('tip');
    if (!I.on || I.paused) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = I.sel
      ? '<b>Click</b> a value to flag it · hold <b>Alt</b> to measure · <b>↑ ↓</b> parent / child · <b>Esc</b> deselect'
      : '<b>Hover</b> to inspect · <b>Click</b> to select · <b>Esc</b> to exit';
    tip.hidden = false;
    const d = $('dock').getBoundingClientRect();
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(d.right - tw, innerWidth - tw - 8)) + 'px';
    tip.style.top = (d.top > 60 ? d.top - 40 : d.bottom + 8) + 'px';
  }

  // ----- overlay drawing
  function schedule() {
    if (!I.raf) I.raf = requestAnimationFrame(() => { I.raf = 0; draw(); });
  }
  const boxCss = (b) => `left:${b.x}px;top:${b.y}px;width:${Math.max(0, b.w)}px;height:${Math.max(0, b.h)}px`;
  const rectBox = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });

  function boxModel(el, outlineCls) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const g = (p) => Math.max(0, num(cs.getPropertyValue(p)));
    const m = { t: g('margin-top'), r: g('margin-right'), b: g('margin-bottom'), l: g('margin-left') };
    const bw = { t: g('border-top-width'), r: g('border-right-width'), b: g('border-bottom-width'), l: g('border-left-width') };
    const p = { t: g('padding-top'), r: g('padding-right'), b: g('padding-bottom'), l: g('padding-left') };
    const bb = rectBox(r);
    const mb = { x: bb.x - m.l, y: bb.y - m.t, w: bb.w + m.l + m.r, h: bb.h + m.t + m.b };
    const pb = { x: bb.x + bw.l, y: bb.y + bw.t, w: bb.w - bw.l - bw.r, h: bb.h - bw.t - bw.b };
    const cb = { x: pb.x + p.l, y: pb.y + p.t, w: pb.w - p.l - p.r, h: pb.h - p.t - p.b };
    const bws = (o) => `border-width:${o.t}px ${o.r}px ${o.b}px ${o.l}px`;
    let h = `<div class="bm bm-m" style="${boxCss(mb)};${bws(m)}"></div><div class="bm bm-b" style="${boxCss(bb)};${bws(bw)}"></div><div class="bm bm-p" style="${boxCss(pb)};${bws(p)}"></div><div class="bm bm-c" style="${boxCss(cb)}"></div><div class="${outlineCls}" style="${boxCss(bb)}"></div>`;
    const lbl = (v, x, y, cls = '') => (v >= 1 ? `<div class="plbl ${cls}" style="left:${x}px;top:${y}px">${r1(v)}</div>` : '');
    h += lbl(p.t, pb.x + pb.w / 2, pb.y + p.t / 2) + lbl(p.b, pb.x + pb.w / 2, pb.y + pb.h - p.b / 2) + lbl(p.l, pb.x + p.l / 2, pb.y + pb.h / 2) + lbl(p.r, pb.x + pb.w - p.r / 2, pb.y + pb.h / 2);
    h += lbl(m.t, bb.x + bb.w / 2, bb.y - m.t / 2, 'm') + lbl(m.b, bb.x + bb.w / 2, bb.y + bb.h + m.b / 2, 'm') + lbl(m.l, bb.x - m.l / 2, bb.y + bb.h / 2, 'm') + lbl(m.r, bb.x + bb.w + m.r / 2, bb.y + bb.h / 2, 'm');
    const below = bb.y + bb.h + m.b + 6;
    const top = below + 20 > innerHeight ? Math.max(4, bb.y - m.t - 24) : below;
    h += `<div class="dim" style="left:${bb.x + bb.w / 2}px;top:${top}px">${r1(bb.w)} × ${r1(bb.h)}</div>`;
    return h;
  }

  function measure(a, b) {
    const L = [];
    const contains = (o, i) => i.left >= o.left && i.right <= o.right && i.top >= o.top && i.bottom <= o.bottom;
    if (contains(b, a) || contains(a, b)) {
      const o = contains(b, a) ? b : a;
      const i = o === b ? a : b;
      const cx = i.left + i.width / 2;
      const cy = i.top + i.height / 2;
      L.push({ x1: cx, y1: o.top, x2: cx, y2: i.top }, { x1: cx, y1: i.bottom, x2: cx, y2: o.bottom }, { x1: o.left, y1: cy, x2: i.left, y2: cy }, { x1: i.right, y1: cy, x2: o.right, y2: cy });
    } else {
      if (b.left >= a.right || a.left >= b.right) {
        const [l, r] = b.left >= a.right ? [a, b] : [b, a];
        const t = Math.max(a.top, b.top);
        const bt = Math.min(a.bottom, b.bottom);
        const y = t < bt ? (t + bt) / 2 : a.top + a.height / 2;
        L.push({ x1: l.right, y1: y, x2: r.left, y2: y });
      }
      if (b.top >= a.bottom || a.top >= b.bottom) {
        const [t, bt] = b.top >= a.bottom ? [a, b] : [b, a];
        const l = Math.max(a.left, b.left);
        const r = Math.min(a.right, b.right);
        const x = l < r ? (l + r) / 2 : a.left + a.width / 2;
        L.push({ x1: x, y1: t.bottom, x2: x, y2: bt.top });
      }
      if (!L.length) {
        L.push({ x1: a.left, y1: Math.min(a.top, b.top), x2: a.left, y2: Math.max(a.top, b.top) });
        L.push({ x1: Math.min(a.left, b.left), y1: a.top, x2: Math.max(a.left, b.left), y2: a.top });
      }
    }
    let h = `<div class="meas-ol" style="${boxCss(rectBox(b))}"></div>`;
    for (const l of L) {
      const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
      if (len < 0.5) continue;
      const horiz = Math.abs(l.y2 - l.y1) < 0.5;
      h += horiz
        ? `<div class="mline" style="left:${Math.min(l.x1, l.x2)}px;top:${l.y1 - 0.5}px;width:${len}px;height:1px"></div>`
        : `<div class="mline" style="left:${l.x1 - 0.5}px;top:${Math.min(l.y1, l.y2)}px;width:1px;height:${len}px"></div>`;
      h += `<div class="mlbl" style="left:${(l.x1 + l.x2) / 2}px;top:${(l.y1 + l.y2) / 2}px">${r1(len)}</div>`;
    }
    return h;
  }

  function draw() {
    if (!I.on || I.paused) {
      $('ov').innerHTML = '';
      $('hcard').hidden = true;
      return;
    }
    const sel = I.sel && I.sel.isConnected ? I.sel : null;
    const hov = I.hover && I.hover !== sel && I.hover.isConnected ? I.hover : null;
    let h = '';
    if (sel) h += boxModel(sel, 'sel-ol');
    if (hov && sel && I.alt) h += measure(sel.getBoundingClientRect(), hov.getBoundingClientRect());
    else if (hov && sel) h += `<div class="hov-ol" style="${boxCss(rectBox(hov.getBoundingClientRect()))}"></div>`;
    else if (hov) h += boxModel(hov, 'hov-ol');
    $('ov').innerHTML = h;
    if (hov && !sel) showCard(hov);
    else $('hcard').hidden = true;
  }

  // ----- value formatting shared by hover card and panel
  function tokenFor(prop, value) {
    const n = K.normValue(value, rootPx());
    if (!n || TRIVIAL.has(n)) return null;
    const t = I.tokens.find((x) => x.norm === n);
    return t ? t.name : null;
  }
  const swatch = (hex) => `<span class="sw" style="background:${esc(hex)}"></span>`;
  const fam = (v) => String(v).split(',')[0].replace(/["']/g, '').trim();
  const four = (t, r, b, l) => (t === r && r === b && b === l ? `${t}` : t === b && l === r ? `${t} ${r}` : `${t} ${r} ${b} ${l}`);
  const sidesOf = (cs, pre, suf = '') => SIDES.map((s) => r1(num(cs.getPropertyValue(`${pre}-${s}${suf}`))));

  function showCard(el) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const rows = [];
    const row = (k, v) => rows.push(`<div class="r"><span class="k">${k}</span><span class="v">${v}</span></div>`);
    const lh = cs.lineHeight === 'normal' ? 'normal' : r1(num(cs.lineHeight));
    row('Font', `${esc(fam(cs.fontFamily))} · ${r1(num(cs.fontSize))}/${lh} · ${cs.fontWeight}`);
    const col = K.normColor(cs.color);
    if (col) row('Color', `${swatch(col)}${col}${tokenFor('color', cs.color) ? ` <span class="t">${esc(tokenFor('color', cs.color))}</span>` : ''}`);
    const bg = K.normColor(cs.backgroundColor);
    if (bg && bg !== 'transparent') row('Fill', `${swatch(bg)}${bg}${tokenFor('background-color', cs.backgroundColor) ? ` <span class="t">${esc(tokenFor('background-color', cs.backgroundColor))}</span>` : ''}`);
    row('Padding', four(...sidesOf(cs, 'padding')));
    const m = sidesOf(cs, 'margin');
    if (m.some((x) => x)) row('Margin', four(...m));
    const bw = sidesOf(cs, 'border', '-width');
    if (bw.some((x) => x)) row('Border', `${four(...bw)} ${cs.borderTopStyle} ${K.normColor(cs.borderTopColor) || ''}`);
    const rad = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => r1(num(v)));
    if (rad.some((x) => x)) row('Radius', four(...rad));
    if (/flex|grid/.test(cs.display) && cs.gap !== 'normal') row('Gap', esc(cs.gap));
    const cls = [...el.classList].slice(0, 3).map((c) => '.' + c).join('');
    const c = $('hcard');
    c.innerHTML = `<div class="h"><b>${el.tagName.toLowerCase()}</b><span>${esc(cls)}</span></div><div class="r"><span class="k">Size</span><span class="v">${r1(r.width)} × ${r1(r.height)}</span></div>${rows.join('')}`;
    c.hidden = false;
    const cw = c.offsetWidth;
    const ch = c.offsetHeight;
    let x = I.mouse.x + 16;
    let y = I.mouse.y + 18;
    if (x + cw > innerWidth - 8) x = I.mouse.x - cw - 12;
    if (y + ch > innerHeight - 8) y = I.mouse.y - ch - 12;
    c.style.left = Math.max(4, x) + 'px';
    c.style.top = Math.max(4, y) + 'px';
  }

  // ----- inspect panel
  function renderPanel() {
    const p = $('insp');
    p.hidden = false;
    p.innerHTML = `
      <div class="ph" data-drag>
        <div style="min-width:0"><div class="ttl" id="iTtl"></div><div class="sub" id="iSub"></div></div>
        <span class="sp"></span>
        <button class="ibtn" data-act="parent" title="Select parent (↑)">↑</button>
        <button class="ibtn" data-act="child" title="Back to child (↓)" ${I.stack.length ? '' : 'disabled'}>↓</button>
        <button class="ibtn" data-act="deselect" title="Close (Esc)">${IC.close}</button>
      </div>
      <div class="pb">${panelSections()}</div>
      <div class="pf"><button class="btn primary grow" data-act="report" id="iReport"></button></div>`;
    renderPanelHeader();
    updateReportBtn();
  }

  function renderPanelHeader() {
    if (!I.sel || $('insp').hidden) return;
    const d = I.selData;
    const r = I.selReact || {};
    const comp = (r.componentChain || []).slice(-1)[0];
    $('iTtl').innerHTML = `&lt;${esc(d.tag)}&gt;${comp ? ` <span class="comp">${esc(comp)}</span>` : ''}`;
    const src = d.sourceAttr && d.sourceAttr.onSelf ? d.sourceAttr.value : r.source || (d.sourceAttr && d.sourceAttr.value);
    const count = r.react ? r.sameComponent : d.sameClassList;
    const sub = $('iSub');
    if (src) {
      sub.className = 'sub';
      sub.innerHTML = `${esc(src)}${count > 1 ? ` · ${count} on this page` : ''}`;
    } else {
      sub.className = 'sub' + (I.selReact === null ? '' : ' warn');
      sub.textContent = I.selReact === null ? 'Reading component…' : `No source file in this build${count > 1 ? ` · ${count} on this page` : ''}`;
    }
  }

  function panelSections() {
    const d = I.selData;
    const cs = d.computedStyles;
    const rowH = (prop, label, valHtml, cur) =>
      `<div class="prow${I.flags.has(prop) ? ' flag' : ''}" data-prop="${prop}" data-cur="${esc(cur)}" title="Click to flag ${esc(prop)} as wrong"><span class="k">${label}</span><span class="v">${valHtml}</span><span class="fl">⚑</span></div>`;
    const tok = (prop, v) => {
      const t = (d.matchedTokens[prop] || [])[0] || tokenFor(prop, v);
      return t ? `<span class="t">${esc(t)}</span>` : '';
    };
    const colorRow = (prop, label) => {
      const hex = K.normColor(cs[prop]) || cs[prop];
      return rowH(prop, label, `${hex && hex !== 'transparent' ? swatch(hex) : ''}${esc(hex)}${tok(prop, cs[prop])}`, hex);
    };
    const tidy = (v) => String(v).replace(/(-?\d+\.\d{2,})px/g, (_m, n) => r1(parseFloat(n)) + 'px');
    const plain = (prop, label, v = cs[prop]) => rowH(prop, label, `${esc(tidy(v))}${tok(prop, cs[prop])}`, tidy(v));

    // Box model diagram (Figma / DevTools style); every number is clickable.
    const n = (prop, pos) => {
      const v = r1(num(cs[prop]));
      return `<span class="n ${pos}${v ? '' : ' zero'}${I.flags.has(prop) ? ' flag' : ''}" data-prop="${prop}" data-cur="${esc(cs[prop])}" title="${prop}: ${esc(cs[prop])}">${v || '–'}</span>`;
    };
    const ring = (pre, suf = '') => n(`${pre}-top${suf}`, 't') + n(`${pre}-right${suf}`, 'r') + n(`${pre}-bottom${suf}`, 'b') + n(`${pre}-left${suf}`, 'l');
    const el = I.sel;
    const r = el.getBoundingClientRect();
    const cw = r1(r.width - num(cs['padding-left']) - num(cs['padding-right']) - num(cs['border-left-width']) - num(cs['border-right-width']));
    const ch = r1(r.height - num(cs['padding-top']) - num(cs['padding-bottom']) - num(cs['border-top-width']) - num(cs['border-bottom-width']));
    let h = `<div class="sec"><div class="sect">Box <span class="muted">${r1(r.width)} × ${r1(r.height)}</span></div>
      <div class="bmd"><div class="box"><span class="lb">margin</span>${ring('margin')}
        <div class="box b"><span class="lb">border</span>${ring('border', '-width')}
          <div class="box p"><span class="lb">padding</span>${ring('padding')}
            <div class="box c">${cw} × ${ch}</div></div></div></div></div></div>`;

    const flex = /flex|grid/.test(cs.display);
    let lay = plain('width', 'Width') + plain('height', 'Height') + plain('display', 'Display');
    if (/flex/.test(cs.display)) lay += plain('flex-direction', 'Direction') + plain('align-items', 'Align items') + plain('justify-content', 'Justify');
    if (flex && cs.gap !== 'normal') lay += plain('gap', 'Gap');
    if (cs.position !== 'static') lay += plain('position', 'Position');
    h += `<div class="sec"><div class="sect">Layout</div>${lay}</div>`;

    let ty = plain('font-family', 'Font', fam(cs['font-family'])) + plain('font-size', 'Size') + plain('font-weight', 'Weight') + plain('line-height', 'Line height');
    if (cs['letter-spacing'] !== 'normal') ty += plain('letter-spacing', 'Letter spacing');
    ty += plain('text-align', 'Align');
    if (cs['text-transform'] !== 'none') ty += plain('text-transform', 'Case');
    ty += colorRow('color', 'Color');
    h += `<div class="sec"><div class="sect">Typography</div>${ty}</div>`;

    let fill = colorRow('background-color', 'Background');
    if (cs.opacity !== '1') fill += plain('opacity', 'Opacity');
    h += `<div class="sec"><div class="sect">Fill</div>${fill}</div>`;

    const bw = SIDES.map((s) => cs[`border-${s}-width`]);
    const bc = SIDES.map((s) => K.normColor(cs[`border-${s}-color`]) || cs[`border-${s}-color`]);
    let bo = '';
    if (bw.every((w) => num(w) === 0)) bo += rowH('border', 'Border', '<span class="muted">None</span>', 'none');
    else if (bw.every((w) => w === bw[0]) && bc.every((c) => c === bc[0])) {
      const v = `${bw[0]} ${cs['border-top-style']} ${bc[0]}`;
      bo += rowH('border', 'Border', `${swatch(bc[0])}${esc(v)}`, v);
    } else
      SIDES.forEach((s, i) => {
        if (num(bw[i])) bo += rowH(`border-${s}`, `Border ${s}`, `${swatch(bc[i])}${esc(`${bw[i]} ${bc[i]}`)}`, `${bw[i]} ${cs['border-top-style']} ${bc[i]}`);
      });
    const rad = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'].map((p) => cs[p]);
    const radV = rad.every((v) => v === rad[0]) ? rad[0] : rad.join(' ');
    bo += rowH('border-radius', 'Radius', `${esc(radV)}${tok('border-top-left-radius', rad[0])}`, radV);
    h += `<div class="sec"><div class="sect">Border</div>${bo}</div>`;

    if (cs['box-shadow'] !== 'none') h += `<div class="sec"><div class="sect">Effects</div>${plain('box-shadow', 'Shadow')}</div>`;
    return h;
  }

  function updateReportBtn() {
    const b = $('iReport');
    if (!b) return;
    const n = I.flags.size;
    b.textContent = n ? `Report issue · ${n} flagged` : 'Report issue';
  }

  $('insp').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'parent') goParent();
      else if (a === 'child') goChild();
      else if (a === 'deselect') deselect();
      else if (a === 'report') report(true);
      return;
    }
    const f = e.target.closest('[data-prop]');
    if (!f) return;
    const prop = f.dataset.prop;
    if (I.flags.has(prop)) I.flags.delete(prop);
    else I.flags.set(prop, f.dataset.cur);
    f.classList.toggle('flag', I.flags.has(prop));
    updateReportBtn();
  });

  // ======================================================================= capture → editor
  let busy = false;

  async function captureScreen() {
    host.style.setProperty('display', 'none', 'important');
    await frames(2);
    await sleep(60);
    try {
      return await send('capture');
    } finally {
      host.style.setProperty('display', 'block', 'important');
    }
  }

  async function report(withElement) {
    if (busy || E) return;
    busy = true;
    try {
      const el = withElement ? I.sel : null;
      const react = el ? I.selReact || (await I.selReactP) : null;
      const tokens = I.tokens.length ? I.tokens : collectTokens();
      const d = el ? describe(el, tokens) : null;
      const redact = state.settings.autoRedact ? redactRects() : [];
      const page = pageInfo(el);
      const env = await envInfo();
      pauseInspect();
      const shot = await captureScreen();
      const rect = el ? el.getBoundingClientRect() : null;
      const element = el ? buildElement(d, react, rect) : null;
      const flagged = [...(el ? I.flags : new Map()).entries()].map(([prop, cur]) => ({ property: prop, current: K.displayValue(cur) }));
      const issue = {
        id: null,
        title: '',
        severity: 'medium',
        status: 'open',
        scope: {
          level: null,
          appliesTo: '',
          patternHints: element ? { tags: d.hints.tags, roles: d.hints.roles, components: element.componentChain.slice(-2), classFragments: d.hints.classFragments } : null,
          alsoSeenOn: [],
          suggestedByTool: null,
        },
        description: '',
        flagged,
        page,
        environment: { viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio, browser: env.browser, os: env.os, capturedAt: K.isoLocal() },
        element,
        figma: { url: '', fileKey: null, nodeId: null, screenshot: null },
        acceptanceExtra: [],
        resolution: null,
        history: [],
        _tokens: tokens,
        _autoRedact: redact,
        _draw: null,
      };
      await openEditor(issue, shot, true);
    } catch (err) {
      toast('Could not capture: ' + err.message, 'err', 6000);
      resumeInspect();
    } finally {
      busy = false;
    }
  }

  async function decodeImage(dataUrl) {
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return createImageBitmap(new Blob([u8], { type: 'image/png' }));
  }

  // ======================================================================= editor
  // Deliberately minimal: screenshot + marks, one description, severity, scope, optional Figma link.
  let E = null;
  const isMark = (s) => s.type === 'box' || s.type === 'arrow';
  const numberOf = (s) => (isMark(s) ? E.shapes.filter(isMark).indexOf(s) + 1 : null);
  const SCOPE_UI = [
    ['instance', 'Only this', 'Fix only this element on this page'],
    ['component', 'This component', 'Fix the component, so every place it is used changes'],
    ['pattern', 'All like this', 'Fix every element of this kind in the app (e.g. all tables)'],
    ['global', 'Everywhere', 'Fix the design token / theme value used everywhere'],
  ];

  async function openEditor(issue, rawDataUrl, isNew) {
    K.ensureDescription(issue);
    const img = await decodeImage(rawDataUrl);
    const scale = img.width / ((issue.environment.viewport && issue.environment.viewport.width) || img.width);
    let shapes;
    if (issue._draw && issue._draw.shapes)
      shapes = issue._draw.shapes
        .map((s) => ({ ...s, type: s.type === 'rect' ? 'box' : s.type }))
        .filter((s) => ['box', 'arrow', 'redact'].includes(s.type));
    else
      shapes = (issue._autoRedact || []).map((r) => ({
        type: 'redact',
        x: Math.round(r.x * scale) - 2, y: Math.round(r.y * scale) - 2, w: Math.round(r.w * scale) + 4, h: Math.round(r.h * scale) + 4,
      }));
    E = { issue, raw: rawDataUrl, isNew, img, scale, shapes, tool: 'box', drawing: null, redacted: null, dirty: isNew, scopeTouched: !isNew };
    if (!issue.scope.level) {
      issue.scope.level = K.suggestScope(K.issueCategories(issue), issue.element);
      issue.scope.suggestedByTool = issue.scope.level;
    }
    if (isNew && !issue.description && issue.flagged && issue.flagged.length)
      issue.description = issue.flagged.map((f) => `${f.property}: ${f.current} → `).join('\n');
    buildEditor();
  }

  function buildEditor() {
    const i = E.issue;
    const el = i.element;
    const comp = el && el.componentChain.slice(-1)[0];
    const what = el ? `&lt;${esc(el.tag)}&gt;${comp ? ' ' + esc(comp) : ''}` : 'Whole screen';
    const m = $('modal');
    m.hidden = false;
    for (const id of ['dock', 'list']) $(id).style.visibility = 'hidden'; // keep the editor unobstructed
    m.innerHTML = `
      <div class="mback"></div>
      <div class="mdlg" role="dialog" aria-modal="true" aria-label="Report issue">
        <div class="mh">
          <span class="ttl">${E.isNew ? 'Report issue' : esc(i.id)}</span>
          <span class="muted">${what} · ${esc(i.page.route || '')}</span>
          <span class="sp"></span>
          ${!E.isNew && i.page && (i.page.url || i.page.route) && (i.page.url || location.origin + i.page.route) !== location.href
            ? `<a class="btn ghost" data-act="gopage" href="${esc(i.page.url || location.origin + i.page.route)}" title="Go to ${esc(i.page.route || '')}">↗ Open page</a>`
            : ''}
          <button class="btn ghost" data-act="cancel">Cancel</button>
          <button class="btn primary" data-act="save" id="eSave">Save <kbd>Ctrl ↵</kbd></button>
        </div>
        <div class="mbody">
          <section class="mcanvas">
            <div class="tools">
              <button class="tool" data-tool="box" aria-pressed="true">▭ Box</button>
              <button class="tool" data-tool="arrow" aria-pressed="false">↗ Arrow</button>
              <button class="tool" data-tool="redact" aria-pressed="false">▦ Blur</button>
              <button class="tool" data-act="undo" title="Undo (Ctrl+Z)">↶</button>
            </div>
            <div class="cwrap"><canvas id="eCv"></canvas></div>
          </section>
          <section class="mform">
            <label class="fld"><span>Title</span><input class="inp" id="eTitle" autocomplete="off"></label>
            <label class="fld"><span>Description</span><textarea class="inp desc" id="eDesc" placeholder="What's wrong and how should it look?&#10;&#10;e.g. Padding should be 12px, text semibold, sort icon missing (see 1)."></textarea></label>
            <div class="fld"><span>Severity</span><div class="seg sev" id="eSev"></div></div>
            <div class="fld"><span>Fix scope</span><div class="seg" id="eScope"></div></div>
            <label class="fld"><span>Figma link <em>Optional</em></span><input class="inp" id="eFigma" placeholder="https://www.figma.com/design/…" autocomplete="off"><div id="eFigmaSt"></div></label>
            <div id="eErr"></div>
          </section>
        </div>
      </div>`;

    const cv = $('eCv');
    cv.width = E.img.width;
    cv.height = E.img.height;
    E.ctx = cv.getContext('2d');
    E.redacted = R.buildRedacted(E.img, E.shapes);
    cv.addEventListener('pointerdown', cvDown);
    cv.addEventListener('pointermove', cvMove);
    cv.addEventListener('pointerup', cvUp);

    $('eDesc').value = i.description || '';
    $('eTitle').value = E.isNew ? '' : i.title || '';
    E.titleTouched = !E.isNew && !!i.title;
    updateTitleHint();
    $('eFigma').value = (i.figma && i.figma.url) || '';
    renderSeverity();
    renderScope();
    renderFigma();
    redrawCanvas();
    const d = $('eDesc');
    d.focus({ preventScroll: true });
    d.setSelectionRange(d.value.indexOf('→ ') >= 0 ? d.value.indexOf('→ ') + 2 : d.value.length, d.value.indexOf('→ ') >= 0 ? d.value.indexOf('→ ') + 2 : d.value.length);
  }

  /** Empty title = generated from the description; the generated text shows as the placeholder. */
  function updateTitleHint() {
    const t = $('eTitle');
    if (t) t.placeholder = K.titleFrom($('eDesc').value, E.issue.element);
  }

  function closeEditor() {
    const m = $('modal');
    m.hidden = true;
    m.innerHTML = '';
    E = null;
    for (const id of ['dock', 'list']) $(id).style.visibility = '';
    resumeInspect();
  }

  function renderSeverity() {
    $('eSev').innerHTML = K.SEVERITIES.map(([v, l]) => `<button data-v="${v}" aria-pressed="${E.issue.severity === v}">${l}</button>`).join('');
  }
  function renderScope() {
    const sug = K.suggestScope(K.issueCategories(E.issue), E.issue.element);
    const lvl = E.issue.scope.level;
    $('eScope').innerHTML = SCOPE_UI.map(
      ([k, label, tip]) => `<button data-v="${k}" aria-pressed="${lvl === k}" title="${esc(tip)}${k === sug ? ' (suggested)' : ''}">${label}${k === sug ? '<span class="dot"></span>' : ''}</button>`
    ).join('');
  }
  function renderFigma() {
    const f = K.parseFigmaUrl($('eFigma').value);
    $('eFigmaSt').innerHTML = !f.url ? '' : f.error ? `<div class="wrn">⚠ ${esc(f.error)}</div>` : `<div class="okt">✓ Frame ${esc(f.nodeId)} linked</div>`;
  }

  // ----- canvas
  function setTool(t) {
    E.tool = t;
    shadow.querySelectorAll('.tools [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  }
  function elementRectPx() {
    const b = E.issue.element && E.issue.element.boundingBox;
    return b ? { x: b.x * E.scale, y: b.y * E.scale, w: b.width * E.scale, h: b.height * E.scale } : null;
  }
  function redrawCanvas() {
    const { ctx, img } = E;
    ctx.clearRect(0, 0, img.width, img.height);
    ctx.drawImage(E.redacted, 0, 0);
    if (state.settings.outlineElement) R.drawOutline(ctx, elementRectPx(), img.width);
    for (const s of E.shapes) R.drawShape(ctx, s, img.width, numberOf(s));
    if (E.drawing) R.drawShape(ctx, E.drawing, img.width, isMark(E.drawing) ? E.shapes.filter(isMark).length + 1 : null);
  }
  function cvPoint(e) {
    const r = $('eCv').getBoundingClientRect();
    return { x: Math.round(((e.clientX - r.left) * E.img.width) / r.width), y: Math.round(((e.clientY - r.top) * E.img.height) / r.height) };
  }
  function cvDown(e) {
    if (e.button !== 0) return;
    const p = cvPoint(e);
    e.target.setPointerCapture(e.pointerId);
    E.drawing = E.tool === 'arrow' ? { type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y } : { type: E.tool, x: p.x, y: p.y, w: 0, h: 0 };
  }
  function cvMove(e) {
    if (!E || !E.drawing) return;
    const p = cvPoint(e);
    if (E.drawing.type === 'arrow') Object.assign(E.drawing, { x2: p.x, y2: p.y });
    else Object.assign(E.drawing, { w: p.x - E.drawing.x, h: p.y - E.drawing.y });
    redrawCanvas();
  }
  function cvUp() {
    if (!E || !E.drawing) return;
    const d = E.drawing;
    E.drawing = null;
    const big = d.type === 'arrow' ? Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 8 : Math.abs(d.w) > 6 && Math.abs(d.h) > 6;
    if (!big) return redrawCanvas();
    if (d.type !== 'arrow') Object.assign(d, R.normRect(d));
    E.shapes.push(d);
    if (d.type === 'redact') E.redacted = R.buildRedacted(E.img, E.shapes);
    E.dirty = true;
    redrawCanvas();
  }
  function undo() {
    const s = E.shapes.pop();
    if (!s) return;
    if (s.type === 'redact') E.redacted = R.buildRedacted(E.img, E.shapes);
    redrawCanvas();
  }

  // ----- editor events
  $('modal').addEventListener('click', (e) => {
    if (!E) return;
    const tool = e.target.closest('[data-tool]');
    if (tool) return setTool(tool.dataset.tool);
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'gopage') {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return; // new tab
        e.preventDefault();
        if (E.dirty && !confirm('Leave without saving your changes?')) return;
        const href = act.getAttribute('href');
        E.dirty = false;
        closeEditor();
        navigateTo(href);
        return;
      }
      if (a === 'save') saveEditor();
      else if (a === 'cancel') cancelEditor();
      else if (a === 'undo') undo();
      return;
    }
    const sev = e.target.closest('#eSev [data-v]');
    if (sev) {
      E.issue.severity = sev.dataset.v;
      E.dirty = true;
      return renderSeverity();
    }
    const sc = e.target.closest('#eScope [data-v]');
    if (sc) {
      E.issue.scope.level = sc.dataset.v;
      E.scopeTouched = true;
      E.dirty = true;
      return renderScope();
    }
  });

  $('modal').addEventListener('input', (e) => {
    if (!E) return;
    E.dirty = true;
    if (e.target.id === 'eFigma') renderFigma();
    else if (e.target.id === 'eDesc') updateTitleHint();
  });

  $('modal').addEventListener('keydown', (e) => {
    if (!E) return;
    const target = e.composedPath()[0] || {};
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      saveEditor();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (typing) target.blur();
      else cancelEditor();
    } else if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
  });

  async function saveEditor() {
    if (!E || busy) return;
    const i = E.issue;
    i.description = $('eDesc').value.trim();
    if (!i.description) {
      $('eErr').innerHTML = '<div class="errs">Describe what\'s wrong.</div>';
      $('eDesc').focus();
      return;
    }
    $('eErr').innerHTML = '';
    const f = K.parseFigmaUrl($('eFigma').value);
    i.figma = { url: f.url, fileKey: f.fileKey, nodeId: f.nodeId, screenshot: null };
    i.title = $('eTitle').value.trim() || K.titleFrom(i.description, i.element);
    i.scope.appliesTo = K.defaultAppliesTo(i.scope.level, i.element);
    i.markCount = E.shapes.filter(isMark).length;
    i.redactionCount = E.shapes.filter((s) => s.type === 'redact').length;
    i._draw = { shapes: E.shapes };
    busy = true;
    $('eSave').disabled = true;
    $('eSave').textContent = 'Saving…';
    try {
      const out = R.renderOutputs(E.img, E.shapes, { numberOf, elementRect: elementRectPx(), outline: state.settings.outlineElement, margin: 16 * E.scale });
      // annotated: WebP (much smaller than PNG, still sharp for UI); element crop: PNG for exact pixels
      const images = { annotated: out.annotated.toDataURL('image/webp', 0.9), element: out.element ? out.element.toDataURL('image/png') : null };
      const id = await send('saveIssue', { issue: i, raw: E.isNew ? E.raw : null, images });
      const wasNew = E.isNew;
      closeEditor();
      if (wasNew && I.on) deselect();
      toast(`${id} saved`);
      refresh();
    } catch (err) {
      $('eErr').innerHTML = `<div class="errs">Save failed: ${esc(err.message)}</div>`;
      $('eSave').disabled = false;
      $('eSave').innerHTML = 'Save <kbd>Ctrl ↵</kbd>';
    } finally {
      busy = false;
    }
  }

  function cancelEditor() {
    if (E.dirty && $('eDesc').value.trim() && !confirm(E.isNew ? 'Discard this issue?' : 'Discard your changes?')) return;
    closeEditor();
  }

  // ======================================================================= issues panel
  // Two views: "Issues" (everything, filterable) and "Retest" (developer said fixed → check again).
  const UI_KEY = 'kqa-ui-v2'; // remembers open panel/view across page navigation (sessionStorage, no data)
  const ui = (() => {
    try {
      return { view: 'all', filter: 'open', q: '', scroll: 0, settings: false, ...JSON.parse(sessionStorage.getItem(UI_KEY) || '{}') };
    } catch {
      return { view: 'all', filter: 'open', q: '', scroll: 0, settings: false };
    }
  })();
  /**
   * Go to the page where a bug was reported WITHOUT reloading when possible:
   * same-origin SPA routes are opened through the app's own router (history.pushState + popstate,
   * which React Router & co. listen to), so this panel, its scroll and the app state stay as they are.
   * If the app does not react (not an SPA), fall back to a normal page load — the panel and scroll
   * position are restored after it.
   */
  async function navigateTo(href) {
    let u;
    try {
      u = new URL(href, location.href);
    } catch {
      return;
    }
    saveUi();
    if (u.href === location.href) return toast('You are already on this page');
    if (u.origin !== location.origin) return location.assign(u.href);
    if (u.pathname === location.pathname && u.search === location.search && u.hash !== location.hash) {
      location.hash = u.hash; // hash-based router
      return;
    }
    let changed = false;
    const mo = new MutationObserver(() => (changed = true));
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    history.pushState(null, '', u.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await sleep(700);
    mo.disconnect();
    if (!changed) location.assign(u.href); // the app has no client-side router for this — load normally
  }

  const saveUi = () => {
    try {
      const pb = $('list').querySelector('.pb');
      if (pb) ui.scroll = pb.scrollTop;
      sessionStorage.setItem(UI_KEY, JSON.stringify({ view: ui.view, filter: ui.filter, q: ui.q, scroll: ui.scroll, open: !$('list').hidden }));
    } catch {
      /* storage blocked */
    }
  };

  const FILTERS = [
    ['open', 'Open', (i) => i.status === 'open' || i.status === 'reopened'],
    ['dev', 'With dev', (i) => K.RETEST.includes(i.status)],
    ['closed', 'Closed', (i) => i.status === 'closed'],
    ['all', 'All', () => true],
  ];
  const pageKey = (i) => i.route || '/';
  /** Where the bug was reported. Older saves may lack the full URL — rebuild it from the path. */
  const pageUrl = (i) => {
    if (i.url) return i.url;
    if (!i.route) return '';
    return i.route.startsWith('#') || location.hash.startsWith('#/') ? `${location.origin}${location.pathname}#${i.route.replace(/^#/, '')}` : location.origin + i.route;
  };
  const ICON = {
    trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    go: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></svg>',
  };
  /** Icon-only link to the page where the issue was reported (opens in this tab; toolbar comes back). */
  const goLink = (i) => {
    const url = pageUrl(i);
    return url
      ? `<a class="go" href="${esc(url)}" title="Go to the page: ${esc(pageKey(i))}" aria-label="Go to the page ${esc(pageKey(i))}">${ICON.go}</a>`
      : `<span class="go off" title="The page address was not recorded for this issue">${ICON.go}</span>`;
  };
  /** Status pill = a real <select> underneath, so changing status is one click + one pick. */
  const statusPill = (i) =>
    `<label class="st st-${esc(i.status)}" title="Change status"><select data-status="${esc(i.id)}" aria-label="Status">${K.STATUSES.map(
      (x) => `<option value="${x}"${x === i.status ? ' selected' : ''}>${esc(K.STATUS_LABEL[x])}</option>`
    ).join('')}</select>${esc(K.STATUS_LABEL[i.status])}${ICON.chev}</label>`;

  function issueRow(i) {
    return `<div class="irow" data-id="${esc(i.id)}">
      <span class="sdot sd-${esc(i.severity)}" title="${esc(K.severityLabel(i.severity))} severity"></span>
      <button class="it" data-edit="${esc(i.id)}" title="Open — ${esc(i.title)}">${esc(i.title)}</button>
      ${goLink(i)}
      ${statusPill(i)}
      <button class="ibtn del" data-del="${esc(i.id)}" title="Delete">${ICON.trash}</button>
    </div>`;
  }

  function retestCard(i) {
    const dev = i.dev || {};
    return `<div class="rcard" data-id="${esc(i.id)}">
      <div class="rt">
        <span class="sdot sd-${esc(i.severity)}" title="${esc(K.severityLabel(i.severity))} severity"></span>
        <button class="it" data-edit="${esc(i.id)}" title="Open — ${esc(i.title)}">${esc(i.title)}</button>
        ${goLink(i)}
      </div>
      <div class="dnote"><b>${esc(K.STATUS_LABEL[i.status])}</b>${dev.note ? ` — ${esc(dev.note)}` : ''}${i.reopenCount ? ` <span class="muted">· reopened ${i.reopenCount}×</span>` : ''}</div>
      <div class="ract">
        <button class="btn sm" data-set="reopened" data-id="${esc(i.id)}">${ICON.undo} Reopen</button>
        <button class="btn sm primary" data-set="closed" data-id="${esc(i.id)}">${ICON.check} Close</button>
      </div>
    </div>`;
  }

  function renderList() {
    const p = $('list');
    const s = state.settings;
    // Order: Open first, then Reopened, then the rest; newest first within each.
    const RANK = { open: 0, reopened: 1, fixed: 2, 'partially-fixed': 3, unresolved: 4, closed: 5 };
    const all = [...state.issues].sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || (a.createdAt < b.createdAt ? 1 : -1));
    const retest = all.filter((i) => K.RETEST.includes(i.status)).sort((a, b) => pageKey(a).localeCompare(pageKey(b)));
    const terms = (ui.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (i) => !terms.length || terms.every((w) => `${i.title} ${i.text || ''} ${i.route}`.toLowerCase().includes(w));
    const shown = (ui.view === 'retest' ? retest : all.filter((FILTERS.find((f) => f[0] === ui.filter) || FILTERS[0])[2])).filter(matches);
    const prevPb = p.querySelector('.pb');
    const keepScroll = prevPb ? prevPb.scrollTop : ui.scroll || 0;

    let body;
    if (!all.length) body = '<div class="empty"><b>No issues yet</b><br>Click <b>Inspect</b>, pick an element and report what\'s wrong.</div>';
    else if (!shown.length)
      body = `<div class="empty">${ui.view === 'retest' ? '<b>Nothing to retest</b><br>When the developer sends back issues.json, click <b>Import</b> — fixed issues show up here.' : terms.length ? `No issues match “${esc(ui.q)}”.` : ui.filter === 'open' ? '<b>No open issues</b><br>Everything is with the developer or closed.' : 'Nothing here.'}</div>`;
    else if (ui.view === 'retest') body = `<div class="rlist">${shown.map(retestCard).join('')}</div>`;
    else body = `<div class="irows">${shown.map(issueRow).join('')}</div>`;

    const counts = Object.fromEntries(FILTERS.map(([k, , fn]) => [k, all.filter(fn).length]));
    p.innerHTML = `
      <div class="ph" data-drag>
        <div><div class="ttl">Issues</div><div class="sub">${esc(s.projectName)} · ${esc(s.environment)} · ${esc(s.reporter)}</div></div>
        <span class="sp"></span>
        <button class="ibtn" data-act="settings" title="Settings">⚙</button>
        <button class="ibtn" data-act="closeList" title="Close">${IC.close}</button>
      </div>
      <div class="sform" ${ui.settings ? '' : 'hidden'}>
        <label class="fld"><span>Project name</span><input class="inp" id="sName" value="${esc(s.projectName)}"></label>
        <div class="g2">
          <label class="fld"><span>Project code</span><input class="inp" id="sCode" value="${esc(s.projectCode)}"></label>
          <label class="fld"><span>Environment</span><select class="inp" id="sEnv">${['UAT', 'SIT', 'DEV', 'STAGING', 'PROD'].map((e) => `<option${e === s.environment ? ' selected' : ''}>${e}</option>`).join('')}</select></label>
        </div>
        <label class="fld"><span>Your tester prefix</span><input class="inp" id="sRep" value="${esc(s.reporter)}"><span class="hint">IDs look like ${esc(s.projectCode)}-${esc(s.reporter)}-001. Give every tester a different prefix.</span></label>
        <label class="chk"><input type="checkbox" id="sRedact" ${s.autoRedact ? 'checked' : ''}> Blur emails, phones, Emirates IDs, inputs</label>
        <label class="chk"><input type="checkbox" id="sOutline" ${s.outlineElement ? 'checked' : ''}> Outline the selected element on screenshots</label>
        <div style="display:flex;gap:8px"><button class="btn primary sm" data-act="saveSettings">Save</button><button class="btn ghost sm" data-act="settings">Cancel</button></div>
        <div class="fld" style="border-top:1px solid var(--gray2);padding-top:12px"><span>Backup</span>
          <span class="hint">Everything (issues + screenshots) in one file. Restore adds back anything missing — nothing is deleted.</span>
          <div style="display:flex;gap:8px"><button class="btn sm" data-act="backup">Download backup</button><label class="btn sm">Restore backup<input type="file" accept=".json,application/json" hidden id="fRestore"></label></div>
        </div>
      </div>
      <div class="lhead">
        <div class="srch"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input class="inp" id="fSearch" type="search" placeholder="Search issues" value="${esc(ui.q || '')}" autocomplete="off"></div>
        <div class="seg tabs">
          <button data-view="all" aria-pressed="${ui.view === 'all'}">Issues <span class="cnt">${all.length}</span></button>
          <button data-view="retest" aria-pressed="${ui.view === 'retest'}">Retest <span class="cnt${retest.length ? ' hot' : ''}">${retest.length}</span></button>
        </div>
        <div class="filters">
          ${ui.view === 'all' ? `<div class="chips">${FILTERS.map(([k, l]) => `<button data-filter="${k}" aria-pressed="${ui.filter === k}">${l}<span>${counts[k]}</span></button>`).join('')}</div>` : '<div class="hint">Open each page with ↗, check it, then Close or Reopen.</div>'}
        </div>
      </div>
      <div class="pb">${body}</div>
      <div class="pf">
        <button class="btn primary grow" data-act="export" title="Open and reopened issues in full; the rest listed by title only">Export ZIP</button>
        <label class="btn" title="Load the issues.json the developer sends back">Import<input type="file" accept=".json,application/json" hidden id="fImport"></label>
        <button class="ibtn" data-act="clear" title="Delete all issues">${ICON.trash}</button>
      </div>`;
    // Re-rendering (status change, search…) must not throw the user back to the top of the list.
    const pb = p.querySelector('.pb');
    pb.scrollTop = scrollResetPending ? 0 : keepScroll;
    scrollResetPending = false;
    pb.onscroll = () => (ui.scroll = pb.scrollTop);
  }
  let scrollResetPending = false;

  /** Small in-page dialog asking why an issue is reopened. Resolves to the note, or null if cancelled. */
  function askReopenNote(issueTitle) {
    return new Promise((resolve) => {
      const d = $('dlg');
      d.hidden = false;
      d.innerHTML = `
        <div class="dback"></div>
        <div class="dbox" role="dialog" aria-modal="true" aria-label="Reopen issue">
          <div class="dt">Reopen issue</div>
          <div class="dsub">${esc(issueTitle)}</div>
          <textarea class="inp" id="dNote" placeholder="What's still wrong? e.g. Padding fixed, but the icon is still missing on the Reports table."></textarea>
          <div class="derr" id="dErr" hidden>Add a short note so the developer knows what to fix.</div>
          <div class="dact"><button class="btn ghost" data-d="cancel">Cancel</button><button class="btn primary" data-d="ok">Reopen</button></div>
        </div>`;
      const note = $('dNote');
      note.focus();
      const done = (v) => {
        d.hidden = true;
        d.innerHTML = '';
        resolve(v);
      };
      const ok = () => {
        const v = note.value.trim();
        if (!v) {
          $('dErr').hidden = false;
          return note.focus();
        }
        done(v);
      };
      d.onclick = (e) => {
        const b = e.target.closest('[data-d]');
        if (b) b.dataset.d === 'ok' ? ok() : done(null);
        else if (e.target.classList.contains('dback')) done(null);
      };
      d.onkeydown = (e) => {
        if (e.key === 'Escape') done(null);
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ok();
      };
    });
  }

  /** Change status; reopening always asks for a note. Returns false if the user cancelled. */
  async function setStatus(id, status) {
    let note = null;
    if (status === 'reopened') {
      const it = state.issues.find((x) => x.id === id);
      note = await askReopenNote((it && it.title) || id);
      if (note === null) {
        renderList(); // put the status pill back
        return false;
      }
    }
    await send('setStatus', { id, status, note });
    await refresh();
    return true;
  }

  $('list').addEventListener('click', async (e) => {
    const t = e.target;
    const go = t.closest('a.go');
    if (go) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; // let the browser open a new tab
      e.preventDefault();
      navigateTo(go.getAttribute('href'));
      return;
    }
    const act = t.closest('[data-act]');
    try {
      const view = t.closest('[data-view]');
      const filter = t.closest('[data-filter]');
      const set = t.closest('[data-set]');
      if (view) {
        ui.view = view.dataset.view;
        scrollResetPending = true;
        renderList();
        return saveUi();
      }
      if (filter) {
        ui.filter = filter.dataset.filter;
        scrollResetPending = true;
        renderList();
        return saveUi();
      }
      if (set) {
        if (!(await setStatus(set.dataset.id, set.dataset.set))) return;
        return toast(set.dataset.set === 'closed' ? 'Closed' : `Reopened — your note goes to the developer in the next export`);
      }
      if (act) {
        const a = act.dataset.act;
        if (a === 'closeList') toggleList(false);
        else if (a === 'settings') {
          ui.settings = !ui.settings;
          renderList();
        } else if (a === 'saveSettings') {
          const code = $('sCode').value.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          const rep = $('sRep').value.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          if (!code || !rep) return toast('Project code and tester prefix are required (letters and numbers).', 'err');
          const settings = { ...state.settings, projectName: $('sName').value.trim() || 'KHDA Application', projectCode: code, environment: $('sEnv').value, reporter: rep, autoRedact: $('sRedact').checked, outlineElement: $('sOutline').checked };
          await send('saveSettings', { settings });
          ui.settings = false;
          await refresh();
          toast('Settings saved');
        } else if (a === 'export') {
          act.disabled = true;
          const r = await send('exportZip');
          toast(
            `Exported ${r.count} open issue${r.count === 1 ? '' : 's'} → ${r.folder}.zip${r.listed ? ` · ${r.listed} other${r.listed === 1 ? '' : 's'} listed by title` : ''}${r.missing.length ? ' · missing images: ' + r.missing.length : ''}`,
            r.missing.length ? 'err' : '',
            6000
          );
          act.disabled = false;
        } else if (a === 'backup') {
          act.disabled = true;
          const r = await send('backup');
          toast(`Backup of ${r.count} issue${r.count === 1 ? '' : 's'} saved to Downloads`);
          act.disabled = false;
        } else if (a === 'clear') {
          if (!state.issues.length) return;
          if (!confirm(`Delete all ${state.issues.length} issues and screenshots from this computer? Export first if you need them. This cannot be undone.`)) return;
          await send('clearAll');
          await refresh();
          toast('All issues deleted');
        }
        return;
      }
      if (t.closest('[data-edit]')) {
        const { issue, raw } = await send('getIssue', { id: t.closest('[data-edit]').dataset.edit });
        if (!raw) return toast('The screenshot for this issue is missing.', 'err');
        pauseInspect();
        await openEditor(issue, raw, false);
      } else if (t.closest('[data-del]')) {
        const id = t.closest('[data-del]').dataset.del;
        if (!confirm(`Delete ${id} and its screenshots? This cannot be undone.`)) return;
        await send('deleteIssue', { id });
        await refresh();
      }
    } catch (err) {
      toast(err.message, 'err', 6000);
      if (act) act.disabled = false;
    }
  });

  // Search: filter as you type, keep focus and caret in the box.
  $('list').addEventListener('input', (e) => {
    if (e.target.id !== 'fSearch') return;
    ui.q = e.target.value;
    scrollResetPending = true;
    renderList();
    const f = $('fSearch');
    f.focus();
    f.setSelectionRange(f.value.length, f.value.length);
    saveUi();
  });

  $('list').addEventListener('change', async (e) => {
    try {
      if (e.target.dataset.status) {
        await setStatus(e.target.dataset.status, e.target.value);
      } else if (e.target.id === 'fRestore') {
        const file = e.target.files[0];
        if (!file) return;
        const r = await send('restore', { text: await file.text() });
        await refresh();
        toast(`Restored: ${r.added} added, ${r.updated} updated`, '', 5000);
      } else if (e.target.id === 'fImport') {
        const file = e.target.files[0];
        if (!file) return;
        const r = await send('importJson', { text: await file.text() });
        ui.view = 'retest';
        saveUi();
        await refresh();
        toast(`Updated ${r.updated} issue${r.updated === 1 ? '' : 's'}${r.skipped.length ? ` · ${r.skipped.length} not on this computer` : ''}. Check the Retest tab.`, '', 6000);
      }
    } catch (err) {
      toast(err.message, 'err', 6000);
    }
  });

  function toggleList(force) {
    const p = $('list');
    const show = force ?? p.hidden;
    p.hidden = !show;
    setPressed('issues', show);
    saveUi();
    if (show) {
      renderList();
      refresh();
    }
  }

  // ======================================================================= dock
  $('dock').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'inspect') (I.on ? stopInspect : startInspect)();
    else if (a === 'screen') report(false);
    else if (a === 'issues') toggleList();
    else if (a === 'hide') {
      send('disable').catch(() => {});
      destroy();
    }
  });

  function destroy() {
    stopInspect();
    host.remove();
    window.__kqaWidget = null;
  }

  window.__kqaWidget = {
    show() {
      if (!host.isConnected) document.documentElement.appendChild(host);
      refresh();
    },
    destroy,
  };
  refresh().then(() => {
    try {
      if (JSON.parse(sessionStorage.getItem(UI_KEY) || '{}').open) toggleList(true);
    } catch {
      /* ignore */
    }
  });
})();
