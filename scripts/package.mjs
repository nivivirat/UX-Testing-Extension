// Builds dist/khda-visual-qa-<version>.zip — the file you upload to the Chrome Web Store /
// Edge Add-ons, or attach to a GitHub release.  Run:  node scripts/package.mjs
// No dependencies: uses the extension's own ZIP writer.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'extension');
const require = createRequire(import.meta.url);
globalThis.KQA = {};
require(join(ext, 'lib', 'zip.js'));

const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
const SKIP = /(^|\/)(README\.md|\.DS_Store|Thumbs\.db)$/;

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(ext)
  .map((p) => ({ name: relative(ext, p).split('\\').join('/'), path: p }))
  .filter((f) => !SKIP.test(f.name))
  .map((f) => ({ name: f.name, data: new Uint8Array(readFileSync(f.path)) }));

const bytes = await globalThis.KQA.makeZipBytes(files);
mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `khda-visual-qa-${manifest.version}.zip`);
writeFileSync(out, bytes);
// Same file under a fixed name, so the README's download button always points at the latest release.
writeFileSync(join(root, 'dist', 'khda-visual-qa.zip'), bytes);
console.log(`${files.length} files → ${relative(root, out)} (${Math.round(bytes.length / 1024)} KB)`);
