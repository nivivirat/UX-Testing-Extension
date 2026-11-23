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
    reopenCount: (i.history || []).filter((h) => h && h.reopenedAt).length, // only the tester's reopens, not the dev's log
    resolution: r, // the developer's full result — the toolbar turns it into a retest checklist
    createdAt: i.createdAt || '',
    updatedAt: i.updatedAt || i.createdAt || '',
    projectId: K.db.projectOf(i),
  };
};

/** Shrink an image for export so Claude reads it at full value without wasting tokens.
 *  Claude bills images by pixels (~w×h/750 tokens) and downsizes anything over ~1568px anyway. */
async function shrinkForClaude(blob, maxEdge) {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await c.convertToBlob({ type: 'image/webp', quality: 0.88 });
    return out.size < blob.size || k < 1 ? out : blob;
  } catch {
    return blob;
  }
}

/** Numbers for the round in progress of the active project (shown in the toolbar). */
async function currentRoundSummary() {
  const pid = await K.db.getActiveProjectId();
  const { rounds, events } = await K.db.getRounds(pid);
  const all = K.roundStats(rounds, events);
  const last = all[all.length - 1];
  // After an export the next round has not started yet — show it as "Round N+1, not started".
  return last && last.inProgress ? last : { n: (last ? last.n : 0) + 1, inProgress: true, notStarted: true, created: 0, closed: 0, reopened: 0, fromDev: 0 };
}

// ---------- message handlers ----------
const handlers = {
  async state() {
    const issues = (await K.db.getAllIssues()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return {
      settings: await K.db.getSettings(),
      projects: await K.db.getProjects(),
      activeProject: await K.db.getActiveProjectId(),
      issues: issues.map(summary),
      round: await currentRoundSummary(),
    };
  },

  /** All rounds of a project with their numbers (for the Rounds page). */
  async rounds({ projectId }) {
    const pid = projectId || (await K.db.getActiveProjectId());
    const { rounds, events } = await K.db.getRounds(pid);
    return K.roundStats(rounds, events);
  },

  async finishRound({ projectId }) {
    const pid = projectId || (await K.db.getActiveProjectId());
    const open = (await K.db.getAllIssues()).filter((i) => K.db.projectOf(i) === pid && K.exporter.isActive(i)).length;
    return K.db.finishRound(pid, { openAtEnd: open });
  },

  /** Open the settings page (projects / preferences / backup) in a tab. */
  async openSettings({ section }) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') + (section ? '#' + section : '') });
    return true;
  },

  async setActiveProject({ id }) {
    if (!(await K.db.getProjects()).some((p) => p.id === id)) throw new Error('Project not found');
    await K.db.setMeta('activeProject', id);
    return true;
  },

  /** Create (no id) or update a project. New projects remember the site they were created on. */
  async saveProject({ project }, sender) {
    const ps = await K.db.getProjects();
    const name = String(project.name || '').trim();
    if (!name) throw new Error('Give the project a name.');
    const code = (String(project.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '')).slice(0, 8) || 'QA';
    const env = String(project.environment || 'UAT');
    if (project.id) {
      const p = ps.find((x) => x.id === project.id);
      if (!p) throw new Error('Project not found');
      Object.assign(p, { name, code, environment: env });
    } else {
      let origin = '';
      try {
        origin = new URL(sender.tab.url).origin;
      } catch {
        /* ignore */
      }
      const p = { id: 'p_' + Math.random().toString(36).slice(2, 9), name, code, environment: env, origin, createdAt: K.isoLocal() };
      ps.push(p);
      await K.db.setMeta('activeProject', p.id);
      project = p;
    }
    await K.db.saveProjects(ps);
    return project.id;
  },

  async deleteProject({ id }) {
    const ps = await K.db.getProjects();
    if (ps.length < 2) throw new Error("This is the only project — it can't be deleted.");
    const n = (await K.db.getAllIssues()).filter((i) => K.db.projectOf(i) === id).length;
    if (n) throw new Error(`This project still has ${n} issue${n === 1 ? '' : 's'}. Delete them first.`);
    await K.db.saveProjects(ps.filter((p) => p.id !== id));
    if ((await K.db.getMeta('activeProject')) === id) await K.db.setMeta('activeProject', ps.find((p) => p.id !== id).id);
    return true;
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
    if (!issue.projectId) issue.projectId = await K.db.getActiveProjectId();
    if (!issue.id) {
      const project = (await K.db.getProjects()).find((p) => p.id === issue.projectId);
      issue.id = await K.db.nextId(settings, project);
      issue.createdAt = issue.createdAt || K.isoLocal();
      await K.db.logEvent(issue.projectId, 'created', issue.id);
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
    if (status !== K.normStatus(issue.status))
      await K.db.logEvent(K.db.projectOf(issue), status === 'closed' || status === 'reopened' ? status : 'status', id, { to: status });
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
      const to = x.status ? K.normStatus(x.status) : null;
      // The developer's answer counts once per issue per round (re-importing the same file doesn't double it).
      if (to && K.RETEST.includes(to) && (to !== K.normStatus(issue.status) || JSON.stringify(x.resolution || null) !== JSON.stringify(issue.resolution || null)))
        await K.db.logEvent(K.db.projectOf(issue), 'devResult', issue.id, { to });
      if (to) issue.status = to;
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
      else if (key === 'projects' && Array.isArray(v)) {
        const ps = await K.db.getProjects();
        for (const p of v) if (!ps.some((x) => x.id === p.id)) ps.push(p);
        await K.db.saveProjects(ps);
      }
    }
    return { added, updated };
  },

  /** Delete every issue (and its images) of one project. */
  async clearProject({ projectId }) {
    for (const i of await K.db.getAllIssues()) if (K.db.projectOf(i) === projectId) await K.db.deleteIssue(i.id);
    return true;
  },

  async clearAll() {
    await K.db.clearIssues();
    return true;
  },

  async exportZip({ projectId }) {
    // One project per ZIP. Open + reopened issues in full; everything else listed by title only.
    const pid = projectId || (await K.db.getActiveProjectId());
    const project = (await K.db.getProjects()).find((p) => p.id === pid);
    const all = (await K.db.getAllIssues()).filter((i) => K.db.projectOf(i) === pid);
    if (!all.some(K.exporter.isActive)) throw new Error(all.length ? 'No open or reopened issues to send.' : 'Nothing to export yet.');
    const s = await K.db.getSettings();
    const settings = { ...s, projectName: project.name, projectCode: project.code, environment: project.environment };
    const { folder, files, missing, detailed, listed } = await K.exporter.buildExportFiles(all, settings, K.db.getBlob, {
      exportedAt: K.isoLocal(),
      // Context screenshot: 1280px when there is an element crop, 1568px for whole-screen issues.
      transform: (blob, kind, issue) => shrinkForClaude(blob, kind === 'element' ? 1000 : issue.element ? 1280 : 1568),
    });
    const bytes = await K.makeZipBytes(files.map((f) => ({ name: `${folder}/${f.name}`, data: f.data })));
    await chrome.downloads.download({ url: 'data:application/zip;base64,' + b64(bytes), filename: folder + '.zip', saveAs: false });
    // Sending the report to the developers ends this testing round; the next action starts a new one.
    await K.db.logEvent(pid, 'exported', null, { count: detailed });
    const round = await K.db.finishRound(pid, { sent: detailed, openAtEnd: detailed });
    return { folder, count: detailed, listed, missing, round };
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
