// Service worker: owns storage (IndexedDB in the extension origin), screenshots, React lookup and export.
// The floating toolbar in the page talks to it with chrome.runtime.sendMessage.
importScripts('lib/util.js', 'lib/zip.js', 'lib/export.js', 'lib/db.js', 'lib/react-info.js', 'lib/redmine.js');
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
    redmine: i.redmine ? { id: i.redmine.id || null, url: i.redmine.url || '', error: i.redmine.error || null } : null,
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

/** Is Redmine set up, and is the active project linked? (for the toolbar's Redmine menu) */
async function redmineState() {
  const cfg = await rmConfig();
  if (!cfg) return { configured: false };
  const pid = await K.db.getActiveProjectId();
  const p = (await K.db.getProjects()).find((x) => x.id === pid);
  return { configured: true, linked: !!(p && p.redmine && p.redmine.projectId), url: RM.base(cfg.url) };
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

// ---------- Redmine ----------
const RM = K.redmine;
/** Config from local storage (address, key, mappings). null when Redmine is not set up / switched off. */
async function rmConfig() {
  const c = await K.db.getMeta('redmine');
  return c && c.url && c.key && c.enabled !== false ? c : null;
}
/** Redmine project/tracker linked to the issue's project, or null. */
async function rmLink(issue) {
  const p = (await K.db.getProjects()).find((x) => x.id === K.db.projectOf(issue));
  return p && p.redmine && p.redmine.projectId ? p.redmine : null;
}
/** Re-encode a stored screenshot for Redmine (PNG/JPEG display everywhere; WebP may not). */
async function rmImage(blob, maxEdge, type) {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    const ctx = c.getContext('2d');
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return await c.convertToBlob(type === 'image/jpeg' ? { type, quality: 0.9 } : { type });
  } catch {
    return blob;
  }
}
/** Plain-text description: reads well whether the Redmine server uses Textile or Markdown. */
function rmDescription(issue) {
  K.ensureDescription(issue);
  const el = issue.element;
  const level = (issue.scope && issue.scope.level) || 'instance';
  const vp = issue.environment && issue.environment.viewport;
  const L = [];
  L.push(String(issue.description || '').trim(), '');
  L.push(`Page: ${(issue.page && issue.page.url) || ''}`);
  if (vp) L.push(`Screen size: ${vp.width} x ${vp.height}${issue.page && issue.page.lang ? `, ${issue.page.lang} / ${String(issue.page.dir || 'ltr').toUpperCase()}` : ''}`);
  L.push(`Fix level: ${level.toUpperCase()} - ${(issue.scope && issue.scope.appliesTo) || K.defaultAppliesTo(level, el)}`);
  L.push(`Severity: ${K.severityLabel(issue.severity || 'medium')}`);
  if (issue.flagged && issue.flagged.length) L.push(`Flagged values: ${issue.flagged.map((f) => `${f.property} = ${f.current}`).join('; ')}`);
  if (el) {
    L.push('', 'Where to look:');
    if (el.source) L.push(`- Source: ${el.source}`);
    if (el.componentChain && el.componentChain.length) L.push(`- Component: ${el.componentChain.slice(-4).join(' > ')}`);
    if (el.selector) L.push(`- Selector: ${el.selector}`);
    const now = K.exporter.currentStyles(el);
    if (now) L.push(`- Current: ${now}`);
  }
  if (issue.figma && issue.figma.url) L.push('', `Figma: ${issue.figma.url}`);
  L.push('', `Screenshots attached. QA ID: ${issue.id} (KHDA Visual QA)`);
  return L.join('\n');
}
const rmSubject = (issue) => String(issue.title || K.titleFrom(issue.description, issue.element)).slice(0, 250);

/** Create the Redmine issue (with screenshots) or update its subject/description. Mutates issue.redmine. */
async function rmPush(issue) {
  const cfg = await rmConfig();
  const link = cfg && (await rmLink(issue));
  if (!cfg || !link) return { skipped: true };
  const subject = rmSubject(issue);
  const description = rmDescription(issue);
  if (issue.redmine && issue.redmine.id) {
    await RM.updateIssue(cfg, issue.redmine.id, { subject, description, notes: 'Description updated from KHDA Visual QA.' });
    issue.redmine = { ...issue.redmine, syncedAt: K.isoLocal(), error: null };
    return { updated: issue.redmine.id };
  }
  const uploads = [];
  if (cfg.attach !== false) {
    for (const [kind, max, type, suffix] of [
      ['element', 1600, 'image/png', 'element.png'],
      ['annotated', 1920, 'image/jpeg', 'screen.jpg'],
    ]) {
      const b = await K.db.getBlob(`${issue.id}:${kind}`);
      if (!b) continue;
      const filename = `${issue.id}-${suffix}`;
      uploads.push({ token: await RM.upload(cfg, await rmImage(b, max, type), filename), filename, content_type: type });
    }
  }
  const payload = { project_id: link.projectId, subject, description };
  if (uploads.length) payload.uploads = uploads;
  if (link.trackerId) payload.tracker_id = link.trackerId;
  const pr = cfg.priority && cfg.priority[issue.severity || 'medium'];
  if (pr) payload.priority_id = pr;
  // Project-specific: severity custom field (e.g. "Severity" = Major) and default assignee.
  const sevVal = link.severityField && link.severityMap && link.severityMap[issue.severity || 'medium'];
  if (link.severityField && link.severityField.id && sevVal) payload.custom_fields = [{ id: link.severityField.id, value: sevVal }];
  if (link.assigneeId) payload.assigned_to_id = link.assigneeId;
  const created = await RM.createIssue(cfg, payload);
  issue.redmine = { id: created.id, url: RM.issueUrl(cfg, created.id), lastStatusId: (created.status && created.status.id) || null, syncedAt: K.isoLocal(), error: null };
  return { created: created.id };
}

/** Mirror a status change into Redmine, with the tester's note as a comment. Returns a warning or null. */
async function rmStatus(issue, status, note) {
  const cfg = await rmConfig();
  if (!cfg || cfg.syncStatus === false || !issue.redmine || !issue.redmine.id) return null;
  const sid = cfg.statusOut && cfg.statusOut[status];
  const notes =
    status === 'reopened'
      ? `Reopened after retest (KHDA Visual QA):\n${note || ''}`.trim()
      : status === 'closed'
        ? 'Verified by the tester and closed (KHDA Visual QA).'
        : `Status set to "${K.STATUS_LABEL[status] || status}" in KHDA Visual QA.`;
  const payload = { notes };
  if (sid) payload.status_id = sid;
  await RM.updateIssue(cfg, issue.redmine.id, payload);
  issue.redmine = { ...issue.redmine, syncedAt: K.isoLocal(), error: null };
  if (!sid) return null;
  // Redmine silently ignores a status its workflow does not allow — check what actually happened.
  const [now] = await RM.issuesStatus(cfg, [issue.redmine.id]);
  const got = now && now.status;
  issue.redmine.lastStatusId = got ? got.id : sid;
  if (got && got.id !== sid) {
    const want = ((cfg.statuses || []).find((x) => x.id === sid) || {}).name || sid;
    return `Redmine #${issue.redmine.id}: your note was added, but its workflow kept the status "${got.name}" instead of "${want}".`;
  }
  return null;
}

/** Pull statuses the developers set in Redmine (+ their latest comment) into the extension. */
async function rmPull(pid) {
  const cfg = await rmConfig();
  if (!cfg) throw new Error('Redmine is not set up — add it in Settings → Redmine.');
  const linked = (await K.db.getAllIssues()).filter((i) => K.db.projectOf(i) === pid && i.redmine && i.redmine.id);
  if (!linked.length) return { checked: 0, updated: 0, changes: [] };
  const remote = await RM.issuesStatus(cfg, linked.map((i) => i.redmine.id));
  const byId = new Map(remote.map((r) => [r.id, r]));
  const me = cfg.user && cfg.user.id;
  const changes = [];
  for (const issue of linked) {
    const r = byId.get(issue.redmine.id);
    if (!r || !r.status) continue;
    const seen = issue.redmine.lastStatusId;
    issue.redmine = { ...issue.redmine, lastStatusId: r.status.id, remoteStatus: r.status.name, syncedAt: K.isoLocal() };
    const meaning = (cfg.statusIn || {})[r.status.id] || '';
    const local = K.normStatus(issue.status);
    if (r.status.id === seen || !meaning || meaning === local) {
      await K.db.putIssue(issue);
      continue;
    }
    // Latest comment written by someone other than me = the developer's note.
    let devNote = '';
    try {
      const journals = await RM.issueJournals(cfg, issue.redmine.id);
      const j = [...journals].reverse().find((x) => x.notes && String(x.notes).trim() && (!me || !x.user || x.user.id !== me));
      devNote = j ? String(j.notes).trim() : '';
    } catch {
      /* comments are a bonus; the status still syncs */
    }
    if (K.RETEST.includes(meaning)) {
      issue.resolution = { status: meaning, notes: devNote || `Redmine status: ${r.status.name}`, resolvedAt: r.updated_on || K.isoLocal(), source: 'redmine', redmineStatus: r.status.name };
      await K.db.logEvent(pid, 'devResult', issue.id, { to: meaning });
    } else if (meaning === 'closed' || meaning === 'reopened') await K.db.logEvent(pid, meaning, issue.id, { to: meaning });
    issue.status = meaning;
    issue.updatedAt = K.isoLocal();
    await K.db.putIssue(issue);
    changes.push({ id: issue.id, redmine: issue.redmine.id, to: meaning, from: local });
  }
  return { checked: linked.length, updated: changes.length, changes };
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
      redmine: await redmineState(),
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
    let redmine = null;
    const cfg = await rmConfig();
    if (cfg && cfg.syncOnSave !== false && (await rmLink(issue))) {
      try {
        redmine = await rmPush(issue);
      } catch (e) {
        issue.redmine = { ...(issue.redmine || {}), error: e.message };
        redmine = { error: e.message };
      }
      await K.db.putIssue(issue);
    }
    return { id: issue.id, redmine };
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
    let warning = null;
    try {
      warning = await rmStatus(issue, status, note);
    } catch (e) {
      issue.redmine = { ...(issue.redmine || {}), error: e.message };
      warning = `Saved here, but Redmine was not updated: ${e.message}`;
    }
    if (issue.redmine) await K.db.putIssue(issue);
    return { warning };
  },

  // ---- Redmine (settings page + toolbar) ----
  async redmineTest({ url, key }) {
    const cfg = { url, key };
    const user = await RM.currentUser(cfg);
    const meta = await RM.meta(cfg);
    return { user, meta, defaults: RM.defaultMappings(meta) };
  },
  async redmineTrackers({ projectId }) {
    const cfg = await K.db.getMeta('redmine');
    return RM.projectTrackers(cfg, projectId);
  },
  async redmineProjectSetup({ projectId }) {
    const cfg = await K.db.getMeta('redmine');
    const setup = await RM.projectSetup(cfg, projectId);
    return { ...setup, severityDefaults: Object.fromEntries(setup.fields.map((f) => [f.id, RM.defaultSeverityMap(f.values)])) };
  },
  async redminePush({ id }) {
    const issue = await K.db.getIssue(id);
    if (!issue) throw new Error(`${id} not found`);
    if (!(await rmConfig())) throw new Error('Redmine is not set up — add it in Settings → Redmine.');
    if (!(await rmLink(issue))) throw new Error('This project is not linked to a Redmine project yet (Settings → Redmine).');
    try {
      const r = await rmPush(issue);
      await K.db.putIssue(issue);
      return { ...r, url: issue.redmine && issue.redmine.url };
    } catch (e) {
      issue.redmine = { ...(issue.redmine || {}), error: e.message };
      await K.db.putIssue(issue);
      throw e;
    }
  },
  /** Send every open/reopened issue of the project that is not in Redmine yet. */
  async redminePushAll({ projectId }) {
    const pid = projectId || (await K.db.getActiveProjectId());
    if (!(await rmConfig())) throw new Error('Redmine is not set up — add it in Settings → Redmine.');
    const todo = (await K.db.getAllIssues()).filter((i) => K.db.projectOf(i) === pid && K.exporter.isActive(i) && !(i.redmine && i.redmine.id));
    if (todo.length && !(await rmLink(todo[0]))) throw new Error('This project is not linked to a Redmine project yet (Settings → Redmine).');
    let sent = 0;
    const failed = [];
    for (const issue of todo) {
      try {
        await rmPush(issue);
        sent++;
      } catch (e) {
        issue.redmine = { ...(issue.redmine || {}), error: e.message };
        failed.push(`${issue.id}: ${e.message}`);
      }
      await K.db.putIssue(issue);
    }
    return { sent, failed };
  },
  async redminePull({ projectId }) {
    return rmPull(projectId || (await K.db.getActiveProjectId()));
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
    const meta = await K.db.allMeta();
    if (meta.redmine) meta.redmine = { ...meta.redmine, key: '' }; // never put the API key in a file
    const data = { kind: 'khda-visual-qa-backup', version: 1, createdAt: K.isoLocal(), issues, blobs, meta };
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
