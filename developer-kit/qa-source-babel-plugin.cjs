// Babel plugin: stamps every JSX host element (div, th, button…) with
//   data-source="src/path/File.tsx:LINE"
// so the KHDA Visual QA extension can tell Claude the exact file and line.
//
// Enable it only for QA/UAT builds (see developer-kit/README.md). Never ship it to production.

module.exports = function qaDataSource({ types: t }) {
  return {
    name: 'khda-qa-data-source',
    visitor: {
      JSXOpeningElement(path, state) {
        const n = path.node.name;
        // host elements only (lower-case tag names); components pass the attribute nowhere useful
        if (n.type !== 'JSXIdentifier' || !/^[a-z]/.test(n.name)) return;
        if (path.node.attributes.some((a) => a.type === 'JSXAttribute' && a.name && a.name.name === 'data-source')) return;
        const loc = path.node.loc;
        if (!loc) return;
        const file = String(state.filename || '').replace(/\\/g, '/');
        const i = file.lastIndexOf('/src/');
        const rel = i >= 0 ? file.slice(i + 1) : file.split('/').slice(-2).join('/');
        path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier('data-source'), t.stringLiteral(`${rel}:${loc.start.line}`)));
      },
    },
  };
};
