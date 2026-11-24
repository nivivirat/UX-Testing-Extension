// Redmine REST API client. Runs in the background service worker (no CORS limits there because
// the extension has host access). The API key is read from local storage at call time and is never
// written to exports, backups or logs.
//
// Redmine API used:
//   GET  /users/current.json                         who am I (connection test)
//   GET  /projects.json?limit=100&offset=N           projects I can see (paginated)
//   GET  /projects/:id.json?include=trackers         trackers enabled in a project
//   GET  /issue_statuses.json                        all statuses
//   GET  /enumerations/issue_priorities.json         priorities
//   POST /uploads.json?filename=…  (octet-stream)    upload a file → token
//   POST /issues.json                                create an issue (with upload tokens)
//   PUT  /issues/:id.json                            update status / add a note (journal)
//   GET  /issues.json?issue_id=1,2&status_id=*       current status of many issues
//   GET  /issues/:id.json?include=journals           comments on one issue
(function (K) {
  'use strict';
  const R = {};

  R.base = (url) => String(url || '').trim().replace(/\/+$/, '');

  /** Low-level call. Throws Error with a message a tester can act on. */
  R.call = async (cfg, method, path, { json, blob, query } = {}) => {
    if (!cfg || !cfg.url || !cfg.key) throw new Error('Redmine is not set up — add the address and API key in Settings → Redmine.');
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    const headers = { 'X-Redmine-API-Key': cfg.key, Accept: 'application/json' };
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (blob) {
      headers['Content-Type'] = 'application/octet-stream';
      body = blob;
    }
    let res;
    try {
      res = await fetch(R.base(cfg.url) + path + qs, { method, headers, body, credentials: 'omit', cache: 'no-store' });
    } catch {
      throw new Error(`Can't reach Redmine at ${R.base(cfg.url)} — check the address and your network/VPN.`);
    }
    if (res.status === 204) return null; // PUT /issues/:id.json answers "No Content"
    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (res.ok) throw new Error('Redmine answered, but not with JSON — is the address the Redmine home page (not a project page)? Is the REST API enabled?');
      }
    }
    if (res.ok) return data;
    if (res.status === 401) throw new Error('Redmine rejected the API key (401). Check the key under My account → API access key.');
    if (res.status === 403) throw new Error('Redmine says you have no permission for this (403). Ask for access to the project.');
    if (res.status === 404) throw new Error('Not found in Redmine (404) — check the address, project or issue number.');
    if (res.status === 422) throw new Error('Redmine refused: ' + ((data && data.errors && data.errors.join('; ')) || 'invalid data (422)'));
    throw new Error(`Redmine error ${res.status}${data && data.errors ? ': ' + data.errors.join('; ') : ''}`);
  };

  R.currentUser = async (cfg) => {
    const d = await R.call(cfg, 'GET', '/users/current.json');
    const u = (d && d.user) || {};
    return { id: u.id, login: u.login, name: [u.firstname, u.lastname].filter(Boolean).join(' ') || u.login };
  };

  /** Everything the mapping screens need, in one go. */
  R.meta = async (cfg) => {
    const projects = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      const d = await R.call(cfg, 'GET', '/projects.json', { query: { limit: 100, offset } });
      const list = (d && d.projects) || [];
      projects.push(...list.map((p) => ({ id: p.id, name: p.name, identifier: p.identifier, parent: p.parent ? p.parent.name : '' })));
      if (!list.length || projects.length >= (d.total_count || 0)) break;
    }
    const st = await R.call(cfg, 'GET', '/issue_statuses.json');
    let priorities = [];
    try {
      const pr = await R.call(cfg, 'GET', '/enumerations/issue_priorities.json');
      priorities = ((pr && pr.issue_priorities) || []).map((p) => ({ id: p.id, name: p.name, isDefault: !!p.is_default }));
    } catch {
      /* some servers hide enumerations — priority mapping is then skipped */
    }
    return {
      projects,
      statuses: ((st && st.issue_statuses) || []).map((s) => ({ id: s.id, name: s.name, isClosed: !!s.is_closed })),
      priorities,
    };
  };

  R.projectTrackers = async (cfg, projectId) => {
    const d = await R.call(cfg, 'GET', `/projects/${encodeURIComponent(projectId)}.json`, { query: { include: 'trackers' } });
    return ((d && d.project && d.project.trackers) || []).map((t) => ({ id: t.id, name: t.name }));
  };

  /**
   * What a project needs for creating issues: trackers, custom fields seen on its issues (with the
   * values people actually use — non-admins can't read field definitions) and members to assign to.
   */
  R.projectSetup = async (cfg, projectId) => {
    const trackers = await R.projectTrackers(cfg, projectId);
    const fields = new Map();
    try {
      const d = await R.call(cfg, 'GET', '/issues.json', { query: { project_id: projectId, status_id: '*', limit: 100, sort: 'id:desc' } });
      for (const i of (d && d.issues) || [])
        for (const c of i.custom_fields || []) {
          if (!fields.has(c.id)) fields.set(c.id, { id: c.id, name: c.name, counts: new Map() });
          if (c.value != null && c.value !== '' && !Array.isArray(c.value)) {
            const f = fields.get(c.id);
            f.counts.set(String(c.value), (f.counts.get(String(c.value)) || 0) + 1);
          }
        }
    } catch {
      /* no issues readable yet — fields can't be detected */
    }
    const members = [];
    try {
      for (let offset = 0; offset < 1000; offset += 100) {
        const d = await R.call(cfg, 'GET', `/projects/${encodeURIComponent(projectId)}/memberships.json`, { query: { limit: 100, offset } });
        const list = (d && d.memberships) || [];
        for (const m of list) if (m.user && !members.some((x) => x.id === m.user.id)) members.push({ id: m.user.id, name: m.user.name, roles: (m.roles || []).map((r) => r.name).join(', ') });
        if (!list.length || offset + list.length >= (d.total_count || 0)) break;
      }
    } catch {
      /* memberships may be hidden — assignment is then skipped */
    }
    return {
      trackers,
      fields: [...fields.values()].map((f) => ({ id: f.id, name: f.name, values: [...f.counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v) })),
      members: members.sort((a, b) => a.name.localeCompare(b.name)),
    };
  };

  /** Default severity → custom-field value, by name (e.g. Critical/Major/Medium/Minor). */
  R.defaultSeverityMap = (values) => {
    const pick = (...res) => {
      for (const re of res) {
        const v = (values || []).find((x) => re.test(x));
        if (v) return v;
      }
      return '';
    };
    return {
      critical: pick(/critical/i, /blocker/i, /urgent/i, /highest/i),
      high: pick(/major/i, /^high$/i, /high/i),
      medium: pick(/medium/i, /normal/i, /moderate/i),
      low: pick(/minor/i, /^low$/i, /low/i, /trivial/i),
    };
  };

  R.upload = async (cfg, blob, filename) => {
    const d = await R.call(cfg, 'POST', '/uploads.json', { blob, query: { filename } });
    if (!d || !d.upload || !d.upload.token) throw new Error('Redmine did not accept the screenshot upload.');
    return d.upload.token;
  };

  R.createIssue = async (cfg, issue) => {
    const d = await R.call(cfg, 'POST', '/issues.json', { json: { issue } });
    if (!d || !d.issue || !d.issue.id) throw new Error('Redmine did not return the new issue number.');
    return d.issue;
  };

  R.updateIssue = (cfg, id, issue) => R.call(cfg, 'PUT', `/issues/${encodeURIComponent(id)}.json`, { json: { issue } });

  /** Current status (and update time) of many issues; ids in chunks of 50. */
  R.issuesStatus = async (cfg, ids) => {
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const d = await R.call(cfg, 'GET', '/issues.json', { query: { issue_id: chunk.join(','), status_id: '*', limit: 100 } });
      out.push(...((d && d.issues) || []));
    }
    return out;
  };

  R.issueJournals = async (cfg, id) => {
    const d = await R.call(cfg, 'GET', `/issues/${encodeURIComponent(id)}.json`, { query: { include: 'journals' } });
    return (d && d.issue && d.issue.journals) || [];
  };

  R.issueUrl = (cfg, id) => `${R.base(cfg.url)}/issues/${id}`;

  // ---------- defaults by name (the tester can change every mapping) ----------
  const find = (list, ...patterns) => {
    for (const re of patterns) {
      const hit = list.find((x) => re.test(x.name));
      if (hit) return hit.id;
    }
    return null;
  };
  /** Which bucket a Redmine status counts in here (filters, Retest, round stats). Every status gets one.
   *  open = with the developer · fixed / partially-fixed / unresolved = back to the tester to retest or review
   *  reopened = failed retest · closed = done. */
  R.defaultCategory = (s) => {
    const n = String((s && s.name) || '');
    if (/re-?open|fail/i.test(n)) return 'reopened';
    if (/partial/i.test(n)) return 'partially-fixed';
    if (/reject|out of scope|duplicate|won.?t|cannot|can.?t fix|not a bug|enhancement|feedback/i.test(n)) return 'unresolved';
    if (/passed|verified|^closed|closed at|^done$/i.test(n)) return 'closed';
    if (/dev fixed|resolved|fixed|ready for|testing|untested|moved to uat|^qa$/i.test(n)) return 'fixed';
    return s && s.isClosed ? 'closed' : 'open';
  };
  /** Bucket for a status id, using the tester's mapping first. */
  R.categoryOf = (cfg, statusId) => {
    const m = cfg && cfg.statusIn && cfg.statusIn[statusId];
    if (m) return m;
    const s = ((cfg && cfg.statuses) || []).find((x) => x.id === statusId);
    return R.defaultCategory(s || { name: '', isClosed: false });
  };

  R.defaultMappings = (meta) => {
    const S = meta.statuses || [];
    const P = meta.priorities || [];
    const firstOpen = (S.find((s) => !s.isClosed) || {}).id || null;
    const statusOut = {
      open: find(S, /^new$/i, /^open$/i) || firstOpen,
      reopened: find(S, /re-?open/i, /^in progress$/i, /^new$/i) || firstOpen,
      closed: find(S, /^closed$/i, /^done$/i, /verified/i) || (S.find((s) => s.isClosed) || {}).id || null,
    };
    const statusIn = {};
    for (const s of S) statusIn[s.id] = R.defaultCategory(s);
    const priority = {
      critical: find(P, /urgent/i, /immediate/i, /critical/i, /highest/i),
      high: find(P, /^high$/i, /high/i),
      medium: find(P, /^normal$/i, /medium/i) || (P.find((p) => p.isDefault) || {}).id || null,
      low: find(P, /^low$/i, /low/i),
    };
    return { statusOut, statusIn, priority };
  };

  K.redmine = R;
})((globalThis.KQA = globalThis.KQA || {}));
