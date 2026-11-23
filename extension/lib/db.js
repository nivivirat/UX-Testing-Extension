// Local-only storage (IndexedDB in the extension's own origin — pages cannot read it).
// Used by the background service worker only.
(function (K) {
  'use strict';

  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open('khda-visual-qa', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('issues', { keyPath: 'id' });
        d.createObjectStore('blobs');
        d.createObjectStore('meta');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(
      (d) =>
        new Promise((resolve, reject) => {
          const t = d.transaction(store, mode);
          const req = fn(t.objectStore(store));
          let out;
          if (req) req.onsuccess = () => (out = req.result);
          t.oncomplete = () => resolve(out);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  const db = {};
  db.getAllIssues = () => tx('issues', 'readonly', (s) => s.getAll());
  db.getIssue = (id) => tx('issues', 'readonly', (s) => s.get(id));
  db.putIssue = (issue) => tx('issues', 'readwrite', (s) => s.put(issue));
  db.deleteIssue = async (id) => {
    await tx('issues', 'readwrite', (s) => s.delete(id));
    await tx('blobs', 'readwrite', (s) => s.delete(IDBKeyRange.bound(id + ':', id + ':￿')));
  };
  db.putBlob = (key, blob) => tx('blobs', 'readwrite', (s) => s.put(blob, key));
  db.getBlob = (key) => tx('blobs', 'readonly', (s) => s.get(key));
  db.deleteBlob = (key) => tx('blobs', 'readwrite', (s) => s.delete(key));
  db.getMeta = (key) => tx('meta', 'readonly', (s) => s.get(key));
  db.setMeta = (key, v) => tx('meta', 'readwrite', (s) => s.put(v, key));
  db.clearIssues = async () => {
    await tx('issues', 'readwrite', (s) => s.clear());
    await tx('blobs', 'readwrite', (s) => s.clear());
  };
  db.allMeta = async () => {
    const keys = await tx('meta', 'readonly', (s) => s.getAllKeys());
    const out = {};
    for (const k of keys) out[k] = await db.getMeta(k);
    return out;
  };
  db.getSettings = async () => ({ ...K.DEFAULT_SETTINGS, ...((await db.getMeta('settings')) || {}) });
  db.saveSettings = (s) => db.setMeta('settings', s);

  // ---------- projects (folders) ----------
  // Issues saved before projects existed have no projectId; they belong to LEGACY_PROJECT.
  db.LEGACY_PROJECT = 'p_default';
  db.projectOf = (issue) => issue.projectId || db.LEGACY_PROJECT;
  db.getProjects = async () => {
    let ps = await db.getMeta('projects');
    if (!Array.isArray(ps) || !ps.length) {
      const s = await db.getSettings(); // seed the first project from the old global settings
      ps = [{ id: db.LEGACY_PROJECT, name: s.projectName || 'KHDA Application', code: s.projectCode || 'KHDA', environment: s.environment || 'UAT', origin: '', createdAt: K.isoLocal() }];
      await db.setMeta('projects', ps);
      await db.setMeta('activeProject', db.LEGACY_PROJECT);
    }
    return ps;
  };
  db.saveProjects = (ps) => db.setMeta('projects', ps);
  db.getActiveProjectId = async () => {
    const ps = await db.getProjects();
    const a = await db.getMeta('activeProject');
    return ps.some((p) => p.id === a) ? a : ps[0].id;
  };

  // ---------- testing rounds ----------
  // A round = import developer results → retest → test the app → export. Export ends the round.
  // rounds:<pid> = [{ n, startedAt, endedAt?, sent?, openAtEnd?, backfilled? }]
  // events:<pid> = [{ type: 'created'|'closed'|'reopened'|'status'|'devResult'|'exported', id, at, round, to? }]
  db.ensureRounds = async (pid) => {
    let rounds = await db.getMeta('rounds:' + pid);
    if (Array.isArray(rounds) && rounds.length) return rounds;
    // First time: put everything that already happened into Round 1 (kept open until the next export).
    const issues = (await db.getAllIssues()).filter((i) => db.projectOf(i) === pid);
    const ev = [];
    for (const i of issues) {
      if (i.createdAt) ev.push({ type: 'created', id: i.id, at: i.createdAt, round: 1 });
      for (const h of i.history || []) if (h && h.reopenedAt) ev.push({ type: 'reopened', id: i.id, at: h.reopenedAt, round: 1 });
      if (i.resolution) ev.push({ type: 'devResult', id: i.id, at: i.resolution.resolvedAt || i.resolution.fixedAt || i.updatedAt || '', to: i.resolution.status || 'fixed', round: 1 });
      if (K.normStatus(i.status) === 'closed') ev.push({ type: 'closed', id: i.id, at: i.updatedAt || i.createdAt || '', round: 1 });
    }
    ev.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const first = ev.find((e) => e.at);
    rounds = [{ n: 1, startedAt: (first && first.at) || K.isoLocal(), backfilled: ev.length > 0 }];
    await db.setMeta('rounds:' + pid, rounds);
    await db.setMeta('events:' + pid, ev);
    return rounds;
  };
  /** The round in progress (starts a new one if the last was finished). */
  db.currentRound = async (pid) => {
    const rounds = await db.ensureRounds(pid);
    let cur = rounds[rounds.length - 1];
    if (cur.endedAt) {
      cur = { n: cur.n + 1, startedAt: K.isoLocal() };
      rounds.push(cur);
      await db.setMeta('rounds:' + pid, rounds);
    }
    return cur;
  };
  db.logEvent = async (pid, type, id, extra = {}) => {
    const cur = await db.currentRound(pid);
    const ev = (await db.getMeta('events:' + pid)) || [];
    ev.push({ type, id, at: K.isoLocal(), round: cur.n, ...extra });
    await db.setMeta('events:' + pid, ev);
  };
  /** Finish the round in progress (called by Export, or by hand). */
  db.finishRound = async (pid, extra = {}) => {
    const cur = await db.currentRound(pid);
    const rounds = await db.getMeta('rounds:' + pid);
    Object.assign(rounds[rounds.length - 1], { endedAt: K.isoLocal(), ...extra });
    await db.setMeta('rounds:' + pid, rounds);
    return cur.n;
  };
  db.getRounds = async (pid) => ({ rounds: await db.ensureRounds(pid), events: (await db.getMeta('events:' + pid)) || [] });

  /** IDs are <PROJECT CODE>-<REPORTER>-<NNN>. The counter never resets, so IDs are never reused. */
  db.nextId = async (settings, project) => {
    const prefix = `${(project && project.code) || settings.projectCode}-${settings.reporter}`;
    const key = 'counter:' + prefix;
    const n = ((await db.getMeta(key)) || 0) + 1;
    await db.setMeta(key, n);
    return `${prefix}-${String(n).padStart(3, '0')}`;
  };

  K.db = db;
})((globalThis.KQA = globalThis.KQA || {}));
