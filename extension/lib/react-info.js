// Run in the PAGE's main world via chrome.scripting.executeScript({ world: 'MAIN', func }).
// Must stay fully self-contained: it is serialised and re-created in the page.
(function (K) {
  'use strict';
  K.reactInfo = function reactInfo(token) {
    const el = document.querySelector('[data-khda-qa-pick="' + token + '"]');
    if (!el) return null;

    const fiberKey = (n) => n && Object.keys(n).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    let host = el;
    let key = fiberKey(el);
    while (host && !key) {
      host = host.parentElement;
      key = fiberKey(host);
    }
    if (!key) return { react: false };

    const SKIP =
      /^(Anonymous|Fragment|StrictMode|Suspense|Profiler|Router|Routes|Route|RenderedRoute|Outlet|BrowserRouter|MemoryRouter|HashRouter|RouterProvider|DataRoutes|ErrorBoundary|Hydrate|Portal|ForwardRef|Memo|Transition|TransitionGroup|Presence|Primitive\..*|.*Provider|.*Context|.*Consumer)$/;
    const nameOf = (t) => {
      if (!t || typeof t === 'string') return null;
      if (typeof t === 'function') return t.displayName || t.name || null;
      if (typeof t === 'object') return t.displayName || nameOf(t.render) || nameOf(t.type) || null;
      return null;
    };
    const rel = (p) => {
      p = String(p).replace(/\\/g, '/');
      const i = p.lastIndexOf('/src/');
      return i >= 0 ? p.slice(i + 1) : p.split('/').slice(-3).join('/');
    };

    const chain = [];
    let source = null;
    let innerType = null;
    let f = host[key];
    for (let i = 0; f && i < 400; f = f.return, i++) {
      // React <= 18 dev builds: on the host fiber this is the JSX location of the element itself.
      if (!source && f._debugSource && f._debugSource.fileName) source = f._debugSource;
      const n = nameOf(f.type);
      if (n && !SKIP.test(n)) {
        if (!innerType) innerType = f.type;
        if (chain[0] !== n) chain.unshift(n);
      }
    }

    let sameComponent = null;
    if (innerType) {
      const seen = new Set();
      const all = document.body.getElementsByTagName('*');
      for (let i = 0; i < all.length && i < 25000; i++) {
        let g = all[i][key];
        for (let d = 0; g && d < 60; g = g.return, d++) {
          const n = nameOf(g.type);
          if (n && !SKIP.test(n)) {
            if (g.type === innerType && !seen.has(g) && !seen.has(g.alternate)) seen.add(g);
            break;
          }
        }
      }
      sameComponent = Math.max(1, seen.size);
    }

    const short = chain.filter((n) => n.length <= 2).length;
    return {
      react: true,
      componentChain: chain.slice(-8),
      source: source ? rel(source.fileName) + ':' + source.lineNumber : null,
      sameComponent,
      minified: chain.length > 0 && short >= chain.length / 2,
    };
  };
})((globalThis.KQA = globalThis.KQA || {}));
