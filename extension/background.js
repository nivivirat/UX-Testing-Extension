// Service worker: owns storage (IndexedDB in the extension origin), screenshots, React lookup and export.
// The floating toolbar in the page talks to it with chrome.runtime.sendMessage.
importScripts('lib/util.js', 'lib/zip.js', 'lib/export.js', 'lib/db.js', 'lib/react-info.js');
const K = self.KQA;
const WIDGET_FILES = ['lib/util.js', 'lib/render.js', 'content/widget-styles.js', 'content/widget.js'];
const canRun = (url) => /^(https?|file):/.test(url || '');

// ---------- toolbar on/off per tab (survives reloads and navigation in that tab) ----------
async function enabledTabs() {
  return (await chrome.storage.session.get('enabled')).enabled || {};
}
async function setEnabled(tabId, on) {
  const e = await enabledTabs();
  if (on) e[tabId] = true;
  else delete e[tabId];
  await chrome.storage.session.set({ enabled: e });
  chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#0F6E5C' }).catch(() => {});
}
const inject = (tabId) => chrome.scripting.executeScript({ target: { tabId }, files: WIDGET_FILES });

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !canRun(tab.url)) return;
  if ((await enabledTabs())[tab.id]) {
    await setEnabled(tab.id, false);
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__kqaWidget && window.__kqaWidget.destroy() }).catch(() => {});
  } else {
    await setEnabled(tab.id, true);
    await inject(tab.id).catch((e) => console.warn('KHDA QA inject failed', e));
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !canRun(tab.url)) return;
  if ((await enabledTabs())[tabId]) {
    chrome.action.setBadgeText({ tabId, text: 'ON' }).catch(() => {});
    inject(tabId).catch(() => {});
  }
});
chrome.tabs.onRemoved.addListener((tabId) => setEnabled(tabId, false));

// ---------- helpers ----------
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function blobToDataUrl(blob) {
  return `data:${blob.type || 'application/octet-stream'};base64,${b64(new Uint8Array(await blob.arrayBuffer()))}`;
}
async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}
/** Compact list row. Defensive: issues saved by any earlier version must still list correctly. */
const summary = (i) => {
  K.ensureDescription(i);
  const r = i.resolution || null;
  return {
    id: i.id,
    title: i.title || K.titleFrom(i.description, i.element),
    text: String(i.description || '').slice(0, 600), // for search in the list
    severity: i.severity || 'medium',
    status: K.normStatus(i.status),
    scope: (i.scope && i.scope.level) || 'instance',
    url: (i.page && i.page.url) || '',
    route: (i.page && i.page.route) || '',
    pageTitle: (i.page && i.page.title) || '',
    tag: i.element ? i.element.tag : null,
    dev: r ? { status: r.status || '', note: [r.notes, r.verification, r.rootCause].filter(Boolean)[0] || '' } : null,
    reopenCount: (i.history || []).length,
    createdAt: i.createdAt || '',
    updatedAt: i.updatedAt || i.createdAt || '',
  };
};

// ---------- message handlers ----------
const handlers = {
  async state() {
    const issues = (await K.db.getAllIssues()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { settings: await K.db.getSettings(), issues: issues.map(summary) };
  },

  async disable(_m, sender) {
    await setEnabled(sender.tab.id, false);
    return true;
  },

  async saveSettings({ settings }) {
    await K.db.saveSettings(settings);
    return true;
  },

  async capture(_m, sender) {
    return chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
  },

  async reactInfo({ token }, sender) {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] },
      world: 'MAIN',
      func: K.reactInfo,
      args: [token],
    });
    return (r && r.result) || null;
  },

  async saveIssue({ issue, raw, images }) {
    const settings = await K.db.getSettings();
    if (!issue.id) {
      issue.id = await K.db.nextId(settings);
      issue.createdAt = issue.createdAt || K.isoLocal();
    }
    issue.updatedAt = K.isoLocal();
    if (raw) await K.db.putBlob(issue.id + ':raw', await dataUrlToBlob(raw));
    await K.db.deleteBlob(`${issue.id}:full`); // no longer exported (v1.2)
    for (const kind of ['annotated', 'element']) {
      if (images && images[kind]) await K.db.putBlob(`${issue.id}:${kind}`, await dataUrlToBlob(images[kind]));
      else if (kind === 'element') await K.db.deleteBlob(`${issue.id}:element`);
    }
    await K.db.putIssue(issue);
    return issue.id;
  },

  async getIssue({ id }) {
    const issue = await K.db.getIssue(id);
    if (!issue) throw new Error(`${id} not found`);
    const raw = await K.db.getBlob(id + ':raw');
    return { issue: K.ensureDescription(issue), raw: raw ? await blobToDataUrl(raw) : null };
  },

  async deleteIssue({ id }) {
    await K.db.deleteIssue(id);
    return true;
  },

  async setStatus({ id, status, note }) {
    const issue = await K.db.getIssue(id);
    if (!issue) throw new Error(`${id} not found`);
    status = K.normStatus(status);
    if (status === 'reopened') {
      // Keep the developer's previous attempt + the tester's reason, so the next fix sees both.
      issue.history = [...(issue.history || []), { ...(issue.resolution || {}), reopenedAt: K.isoLocal(), reopenNote: (note || '').trim() }];
      issue.resolution = null;
    }
    issue.status = status;
    issue.updatedAt = K.isoLocal();
    await K.db.putIssue(issue);
    return true;
  },

  async importJson({ text }) {
    const json = JSON.parse(text);
    if (!Array.isArray(json.issues)) throw new Error('No "issues" list — is this the issues.json from a KHDA QA export?');
    let updated = 0;
    const skipped = [];
    for (const x of json.issues) {
      const issue = await K.db.getIssue(x.id);
      if (!issue) {
        skipped.push(x.id);
        continue;
      }
      if (x.status) issue.status = K.normStatus(x.status);
      if (x.resolution !== undefined) issue.resolution = x.resolution;
      if (Array.isArray(x.history)) issue.history = x.history;
      issue.updatedAt = K.isoLocal();
      await K.db.putIssue(issue);
      updated++;
    }
    return { updated, skipped };
  },

  /** Full backup: every issue, every image and the ID counters, in one JSON file. */
  async backup() {
    const issues = await K.db.getAllIssues();
    const blobs = {};
    for (const i of issues)
      for (const kind of ['raw', 'annotated', 'element', 'full']) {
        const b = await K.db.getBlob(`${i.id}:${kind}`);
        if (b) blobs[`${i.id}:${kind}`] = await blobToDataUrl(b);
      }
    const data = { kind: 'khda-visual-qa-backup', version: 1, createdAt: K.isoLocal(), issues, blobs, meta: await K.db.allMeta() };
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const d = K.isoLocal().slice(0, 10);
    await chrome.downloads.download({ url: 'data:application/json;base64,' + b64(bytes), filename: `KHDA-QA-backup-${d}.json`, saveAs: false });
    return { count: issues.length };
  },

  /** Merge a backup: adds missing issues, updates ones that are newer in the backup. Never deletes. */
  async restore({ text }) {
    const data = JSON.parse(text);
    if (data.kind !== 'khda-visual-qa-backup' || !Array.isArray(data.issues)) throw new Error('This is not a KHDA Visual QA backup file.');
    let added = 0;
    let updated = 0;
    for (const issue of data.issues) {
      const cur = await K.db.getIssue(issue.id);
      if (cur && (cur.updatedAt || '') >= (issue.updatedAt || '')) continue;
      await K.db.putIssue(issue);
      for (const [key, url] of Object.entries(data.blobs || {})) if (key.startsWith(issue.id + ':')) await K.db.putBlob(key, await dataUrlToBlob(url));
      cur ? updated++ : added++;
    }
    for (const [key, v] of Object.entries(data.meta || {})) {
      if (key.startsWith('counter:')) await K.db.setMeta(key, Math.max((await K.db.getMeta(key)) || 0, v || 0));
      else if (key === 'settings' && !(await K.db.getMeta('settings'))) await K.db.setMeta(key, v);
    }
    return { added, updated };
  },

  async clearAll() {
    await K.db.clearIssues();
    return true;
  },

  async exportZip() {
    // Open + reopened issues are exported in full (screenshots, details). Everything else is only
    // listed by title in the README, so the ZIP stays small and the developer focuses on what's open.
    const all = await K.db.getAllIssues();
    if (!all.some(K.exporter.isActive)) throw new Error(all.length ? 'No open or reopened issues to send.' : 'Nothing to export yet.');
    const settings = await K.db.getSettings();
    const { folder, files, missing, detailed, listed } = await K.exporter.buildExportFiles(all, settings, K.db.getBlob, { exportedAt: K.isoLocal() });
    const bytes = await K.makeZipBytes(files.map((f) => ({ name: `${folder}/${f.name}`, data: f.data })));
    await chrome.downloads.download({ url: 'data:application/zip;base64,' + b64(bytes), filename: folder + '.zip', saveAs: false });
    return { folder, count: detailed, listed, missing };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = handlers[msg && msg.type];
  if (!h) return false;
  h(msg, sender).then(
    (result) => sendResponse({ ok: true, result }),
    (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
  );
  return true;
});
