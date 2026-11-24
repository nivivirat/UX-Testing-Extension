// Settings page (opened from the toolbar's ⚙ / "Manage projects"). Runs in the extension's own
// origin, so it reads and writes the same IndexedDB as the background worker directly.
(() => {
  'use strict';
  const K = window.KQA;
  const db = K.db;
  const $ = (id) => document.getElementById(id);
  const esc = K.escHtml;
  const ENVS = ['UAT', 'SIT', 'DEV', 'STAGING', 'PROD'];

  let toastTimer = 0;
  function toast(msg, kind = '') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3500);
  }
  const send = (type, data = {}) =>
    new Promise((resolve, reject) =>
      chrome.runtime.sendMessage({ type, ...data }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        res && res.ok ? resolve(res.result) : reject(new Error((res && res.error) || 'No response'));
      })
    );

  // ---------- routing (#projects, #projects/new, #preferences, #backup) ----------
  function route() {
    const [section, sub] = (location.hash.replace('#', '') || 'projects').split('/');
    const SECTIONS = ['rounds', 'projects', 'redmine', 'preferences', 'backup'];
    const sec = SECTIONS.includes(section) ? section : 'projects';
    for (const s of SECTIONS) $('s-' + s).hidden = s !== sec;
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === sec ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (sec === 'projects') {
      renderProjects();
      if (sub === 'new') openForm(null);
    }
    if (sec === 'preferences') renderPrefs();
    if (sec === 'rounds') renderRounds();
    if (sec === 'redmine') renderRedmine();
  }
  window.addEventListener('hashchange', route);

  // ---------- projects ----------
  let editing = null; // project id being edited, or null for "new"
  const codeFrom = (name) =>
    name
      .split(/\s+/)
      .map((w) => w[0] || '')
      .join('')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || 'QA';
  const host = (origin) => {
    try {
      return new URL(origin).host;
    } catch {
      return '';
    }
  };

  async function renderProjects() {
    const [ps, active, issues] = await Promise.all([db.getProjects(), db.getActiveProjectId(), db.getAllIssues()]);
    const count = (id) => issues.filter((i) => db.projectOf(i) === id).length;
    const open = (id) => issues.filter((i) => db.projectOf(i) === id && ['open', 'reopened'].includes(K.normStatus(i.status))).length;
    $('projList').innerHTML = ps
      .map((p) => {
        const n = count(p.id);
        return `<div class="prow" data-id="${esc(p.id)}">
          <div>
            <div class="pt">${esc(p.name)}${p.id === active ? '<span class="badge">Active</span>' : ''}</div>
            <div class="pm"><span>${esc(p.environment)}</span><span>Prefix <span class="mono">${esc(p.code)}</span></span>${p.origin ? `<span>${esc(host(p.origin))}</span>` : ''}<span>${n} issue${n === 1 ? '' : 's'}${n ? ` · ${open(p.id)} open` : ''}</span></div>
          </div>
          <div class="pact">
            ${p.id === active ? '' : '<button class="btn sm ghost" data-a="activate">Set active</button>'}
            <button class="btn sm" data-a="edit">Edit</button>
            <button class="btn sm ghost danger" data-a="delete" ${n || ps.length < 2 ? `disabled title="${ps.length < 2 ? 'The only project cannot be deleted' : 'Delete its issues first'}"` : ''}>Delete</button>
          </div>
        </div>`;
      })
      .join('') || '<div class="empty">No projects yet.</div>';
  }

  function setEnv(v) {
    $('pEnv').innerHTML = ENVS.map((e) => `<button type="button" role="radio" data-env="${e}" aria-checked="${e === v}">${e}</button>`).join('');
  }
  $('pEnv').addEventListener('click', (e) => {
    const b = e.target.closest('[data-env]');
    if (b) setEnv(b.dataset.env);
  });
  const envValue = () => ($('pEnv').querySelector('[aria-checked="true"]') || {}).dataset?.env || 'UAT';

  async function updatePreview() {
    const s = await db.getSettings();
    const code = ($('pCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || codeFrom($('pName').value)).slice(0, 8);
    $('idPreview').textContent = `${code}-${s.reporter || 'QA'}-001`;
  }
  $('pName').addEventListener('input', updatePreview);
  $('pCode').addEventListener('input', updatePreview);

  async function openForm(id) {
    editing = id;
    const p = id ? (await db.getProjects()).find((x) => x.id === id) : null;
    $('formTitle').textContent = p ? 'Edit project' : 'New project';
    $('saveForm').textContent = p ? 'Save' : 'Create project';
    $('pName').value = p ? p.name : '';
    $('pCode').value = p ? p.code : '';
    $('pSite').value = p && p.origin ? p.origin : '';
    $('formHint').textContent = p ? '' : 'It becomes the active project.';
    $('formErr').hidden = true;
    setEnv(p ? p.environment : 'UAT');
    $('projForm').hidden = false;
    updatePreview();
    $('pName').focus();
  }
  function closeForm() {
    $('projForm').hidden = true;
    editing = null;
    if (location.hash === '#projects/new') history.replaceState(null, '', '#projects');
  }
  $('newProject').onclick = () => openForm(null);
  $('cancelForm').onclick = closeForm;

  $('projForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('pName').value.trim();
    const err = (m) => {
      $('formErr').textContent = m;
      $('formErr').hidden = false;
    };
    if (!name) return err('Give the project a name.');
    let origin = '';
    const site = $('pSite').value.trim();
    if (site) {
      try {
        origin = new URL(/^https?:\/\//.test(site) ? site : 'https://' + site).origin;
      } catch {
        return err('The site is not a valid web address.');
      }
    }
    const code = ($('pCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || codeFrom(name)).slice(0, 8);
    const ps = await db.getProjects();
    if (editing) Object.assign(ps.find((p) => p.id === editing), { name, code, environment: envValue(), origin });
    else {
      const p = { id: 'p_' + Math.random().toString(36).slice(2, 9), name, code, environment: envValue(), origin, createdAt: K.isoLocal() };
      ps.push(p);
      await db.setMeta('activeProject', p.id);
    }
    await db.saveProjects(ps);
    toast(editing ? 'Project saved' : `Project "${name}" created`);
    closeForm();
    renderProjects();
  });

  $('projList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const id = b.closest('[data-id]').dataset.id;
    const ps = await db.getProjects();
    const p = ps.find((x) => x.id === id);
    if (b.dataset.a === 'edit') openForm(id);
    else if (b.dataset.a === 'activate') {
      await db.setMeta('activeProject', id);
      toast(`${p.name} is now active`);
      renderProjects();
    } else if (b.dataset.a === 'delete') {
      if (!confirm(`Delete the project "${p.name}"?`)) return;
      await db.saveProjects(ps.filter((x) => x.id !== id));
      if ((await db.getMeta('activeProject')) === id) await db.setMeta('activeProject', ps.find((x) => x.id !== id).id);
      toast('Project deleted');
      renderProjects();
    }
  });

  // ---------- rounds ----------
  let roundsProject = null;
  const day = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? String(iso).slice(0, 10) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  async function renderRounds() {
    const ps = await db.getProjects();
    if (!roundsProject || !ps.some((p) => p.id === roundsProject)) roundsProject = await db.getActiveProjectId();
    $('roundProjects').innerHTML =
      ps.length > 1 ? ps.map((p) => `<button class="pchip${p.id === roundsProject ? ' on' : ''}" data-rp="${esc(p.id)}">${esc(p.name)}</button>`).join('') : '';
    const { rounds, events } = await db.getRounds(roundsProject);
    const stats = K.roundStats(rounds, events);
    const cur = stats[stats.length - 1];
    const live = cur && cur.inProgress;
    $('finishRound').hidden = !live;

    // Current round as stat tiles: numbers in ink; status words always written, colour only as a dot.
    const tile = (label, value, sub = '', dot = '') =>
      `<div class="tile"><div class="tl">${dot ? `<span class="tdot" style="background:${dot}"></span>` : ''}${label}</div><div class="tv">${value}</div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;
    if (cur) {
      const head = live ? `Round ${cur.n} — in progress` : `Round ${cur.n} — finished ${day(cur.endedAt)}`;
      $('roundCurrent').innerHTML = `
        <div class="rhead"><b>${head}</b><span class="muted">started ${day(cur.startedAt)}${cur.backfilled ? ' · includes testing from before rounds were tracked' : ''}</span></div>
        <div class="tiles">
          ${tile('New issues', cur.created)}
          ${tile('From developer', cur.fromDev, cur.fromDev ? `${cur.devFixed} fixed · ${cur.devPartly} partly · ${cur.devCouldnt} couldn't` : '')}
          ${tile('Closed', cur.closed, 'passed retest', '#107D32')}
          ${tile('Reopened', cur.reopened, 'failed retest', '#E5484D')}
          ${tile('Pass rate', cur.passRate == null ? '—' : cur.passRate + '%', cur.passRate == null ? 'nothing retested yet' : `${cur.closed} of ${cur.closed + cur.reopened} retested`)}
        </div>`;
    } else $('roundCurrent').innerHTML = '';

    // Every round, newest first.
    const rows = [...stats].reverse();
    $('roundTable').innerHTML = rows.length
      ? `<table class="rtable">
          <thead><tr><th>Round</th><th>Dates</th><th class="num">New</th><th class="num">From dev</th><th class="num">Closed</th><th class="num">Reopened</th><th class="num">Pass rate</th><th class="num">Sent to dev</th></tr></thead>
          <tbody>${rows
            .map(
              (r) => `<tr>
                <td><b>Round ${r.n}</b>${r.inProgress ? ' <span class="badge">In progress</span>' : ''}</td>
                <td class="muted">${day(r.startedAt)} – ${r.endedAt ? day(r.endedAt) : 'now'}</td>
                <td class="num">${r.created}</td>
                <td class="num">${r.fromDev}</td>
                <td class="num">${r.closed}</td>
                <td class="num">${r.reopened}</td>
                <td class="num">${r.passRate == null ? '—' : r.passRate + '%'}</td>
                <td class="num">${r.sent == null ? '—' : r.sent}</td>
              </tr>`
            )
            .join('')}</tbody>
        </table>`
      : '<div class="empty">No rounds yet.</div>';
  }
  $('roundProjects').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rp]');
    if (!b) return;
    roundsProject = b.dataset.rp;
    renderRounds();
  });
  $('finishRound').onclick = async () => {
    if (!confirm('Finish this round now? The next thing you do (report, retest, import) starts a new round. Exporting also finishes a round.')) return;
    const open = (await db.getAllIssues()).filter((i) => db.projectOf(i) === roundsProject && ['open', 'reopened'].includes(K.normStatus(i.status))).length;
    const n = await db.finishRound(roundsProject, { openAtEnd: open });
    toast(`Round ${n} finished`);
    renderRounds();
  };

  // ---------- custom dropdown (Vercel style; native <select> menus can't be styled) ----------
  let openV = null;
  function closeV() {
    if (!openV) return;
    openV.menu.remove();
    openV.btn.setAttribute('aria-expanded', 'false');
    openV = null;
  }
  document.addEventListener('pointerdown', (e) => {
    if (openV && !openV.menu.contains(e.target) && !openV.btn.contains(e.target)) closeV();
  });
  window.addEventListener('resize', closeV);
  /** Renders a dropdown button into `host`. options: [{ value, label, sub? }] */
  function vselect(host, { options, value, placeholder = 'Choose…', onChange, search = false }) {
    const cur = options.find((o) => String(o.value) === String(value));
    host.innerHTML = `<button type="button" class="vsel${cur ? '' : ' empty'}" aria-haspopup="listbox" aria-expanded="false"><span class="vl">${esc(cur ? cur.label : placeholder)}</span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>`;
    const btn = host.querySelector('.vsel');
    btn.onclick = () => {
      if (openV && openV.btn === btn) return closeV();
      closeV();
      const menu = document.createElement('div');
      menu.className = 'vmenu';
      menu.setAttribute('role', 'listbox');
      const draw = (q = '') => {
        const list = options.filter((o) => !q || (o.label + ' ' + (o.sub || '')).toLowerCase().includes(q.toLowerCase()));
        menu.querySelector('.vlist').innerHTML = list.length
          ? list
              .map(
                (o) =>
                  `<button type="button" class="vi" role="option" data-v="${esc(o.value)}" aria-selected="${String(o.value) === String(value)}"><span class="vt">${esc(o.label)}</span>${o.sub ? `<span class="vs">${esc(o.sub)}</span>` : ''}<span class="vc">${String(o.value) === String(value) ? '✓' : ''}</span></button>`
              )
              .join('')
          : '<div class="vnone">No matches</div>';
      };
      menu.innerHTML = `${search ? '<input class="vq" placeholder="Search…">' : ''}<div class="vlist"></div>`;
      document.body.appendChild(menu);
      draw();
      const r = btn.getBoundingClientRect();
      menu.style.minWidth = r.width + 'px';
      const mh = menu.offsetHeight;
      menu.style.left = Math.min(r.left + scrollX, scrollX + innerWidth - menu.offsetWidth - 8) + 'px';
      menu.style.top = (r.bottom + 6 + mh > innerHeight ? r.top + scrollY - mh - 6 : r.bottom + scrollY + 6) + 'px';
      btn.setAttribute('aria-expanded', 'true');
      openV = { btn, menu };
      const q = menu.querySelector('.vq');
      if (q) {
        q.oninput = () => draw(q.value);
        q.focus();
      } else (menu.querySelector('[aria-selected="true"]') || menu.querySelector('.vi') || btn).focus();
      menu.onclick = (e) => {
        const b = e.target.closest('.vi');
        if (!b) return;
        const o = options.find((x) => String(x.value) === b.dataset.v);
        closeV();
        value = o.value;
        host.querySelector('.vl').textContent = o.label;
        btn.classList.remove('empty');
        onChange(o.value);
      };
      menu.onkeydown = (e) => {
        const items = [...menu.querySelectorAll('.vi')];
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          (items[i + 1] || items[0]).focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          (items[i - 1] || items[items.length - 1]).focus();
        } else if (e.key === 'Escape') {
          closeV();
          btn.focus();
        }
      };
    };
  }

  // ---------- Redmine ----------
  // Every Redmine status counts in exactly one of these buckets (no "ignore": the list always mirrors Redmine).
  const MEANINGS = [
    { value: 'open', label: 'Open', sub: 'with the developer' },
    { value: 'reopened', label: 'Reopened', sub: 'failed retest' },
    { value: 'fixed', label: 'Fixed', sub: 'Retest tab' },
    { value: 'partially-fixed', label: 'Partly fixed', sub: 'Retest tab' },
    { value: 'unresolved', label: "Couldn't fix / rejected", sub: 'Retest tab — review' },
    { value: 'closed', label: 'Closed', sub: 'done' },
  ];
  const getRm = async () => (await db.getMeta('redmine')) || {};
  let rmSavedTimer = 0;
  async function saveRm(patchObj) {
    const cur = await getRm();
    await db.setMeta('redmine', { ...cur, ...patchObj });
    $('rmSaved').hidden = false;
    clearTimeout(rmSavedTimer);
    rmSavedTimer = setTimeout(() => ($('rmSaved').hidden = true), 1500);
  }
  const rowsHtml = (rows) => rows.map(([label, sub, id]) => `<div class="row map"><div><b>${label}</b>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="vhost" id="${id}"></div></div>`).join('');

  async function renderRedmine() {
    const c = await getRm();
    $('rmUrl').value = c.url || '';
    $('rmKey').value = c.key || '';
    $('rmErr').hidden = true;
    $('rmWho').textContent = c.user ? `Connected as ${c.user.name}${c.user.login ? ' (' + c.user.login + ')' : ''}` : 'Not connected';
    $('rmDisconnect').hidden = !c.key;
    const ready = !!(c.url && c.key && c.statuses);
    $('rmMore').hidden = !ready;
    if (!ready) return;

    // projects: Redmine project, tracker, assignee and severity field — per project
    const ps = await db.getProjects();
    $('rmProjects').innerHTML = ps
      .map(
        (p, n) => `<div class="rmproj" id="rmp${n}">
          <div class="row map"><div><b>${esc(p.name)}</b><p class="muted">${esc(p.environment || '')}</p></div><div class="vpair"><div class="vh1"></div><div class="vh2"></div></div></div>
          <div class="rmsub" hidden></div>
        </div>`
      )
      .join('');
    ps.forEach((p, n) => {
      const box = $('rmp' + n);
      const link = { ...(p.redmine || {}) };
      const save = async (patchObj) => {
        Object.assign(link, patchObj);
        await setLink(p.id, patchObj);
      };
      const drawDetails = async (projectId) => {
        const h2 = box.querySelector('.vh2');
        const sub = box.querySelector('.rmsub');
        sub.hidden = true;
        if (!projectId) return (h2.innerHTML = '');
        h2.innerHTML = '<span class="muted small">Loading…</span>';
        let setup;
        try {
          setup = await send('redmineProjectSetup', { projectId });
        } catch (err) {
          return (h2.innerHTML = `<span class="errtxt">${esc(err.message)}</span>`);
        }
        // tracker (default: "Bug")
        const T = setup.trackers;
        const tId = link.trackerId && T.some((t) => t.id === link.trackerId) ? link.trackerId : (T.find((t) => /bug/i.test(t.name)) || T[0] || {}).id;
        if (tId !== link.trackerId) await save({ trackerId: tId || null, trackerName: (T.find((t) => t.id === tId) || {}).name || null });
        vselect(h2, { options: T.map((t) => ({ value: t.id, label: t.name })), value: tId, placeholder: 'Tracker', onChange: (v) => save({ trackerId: v, trackerName: (T.find((t) => t.id === v) || {}).name }) });

        // severity field (default: a custom field named "Severity") + value mapping
        const F = setup.fields.filter((f) => f.values.length);
        let sevField = link.severityField && F.find((f) => f.id === link.severityField.id);
        if (!link.severityField && !link.severityFieldChosen) {
          sevField = F.find((f) => /severity|criticality|impact/i.test(f.name)) || null;
          if (sevField) await save({ severityField: { id: sevField.id, name: sevField.name }, severityMap: setup.severityDefaults[sevField.id] });
        }
        const M = setup.members;
        sub.innerHTML = `
          <div class="row map sub"><div><b>Assign new issues to</b><p class="muted">${M.length ? 'Optional — leave on Nobody to let the team triage.' : 'Members are not visible to your account.'}</p></div><div class="vhost" data-h="assign"></div></div>
          <div class="row map sub"><div><b>Severity field</b><p class="muted">${F.length ? 'Redmine custom field that holds the severity.' : 'No custom fields found on the issues of this project.'}</p></div><div class="vhost" data-h="sevf"></div></div>
          <div class="sevrows"></div>`;
        sub.hidden = false;
        if (M.length)
          vselect(sub.querySelector('[data-h="assign"]'), {
            options: [{ value: '', label: 'Nobody' }, ...M.map((m) => ({ value: m.id, label: m.name, sub: m.roles }))],
            value: link.assigneeId || '',
            search: M.length > 7,
            onChange: (v) => save({ assigneeId: v || null, assigneeName: v ? (M.find((m) => m.id === v) || {}).name : null }),
          });
        const drawSev = () => {
          const rows = sub.querySelector('.sevrows');
          const f = link.severityField && F.find((x) => x.id === link.severityField.id);
          if (!f) return (rows.innerHTML = '');
          rows.innerHTML = K.SEVERITIES.map(([k, l]) => `<div class="row map sub sev"><div><span class="muted">Severity</span> <b>${l}</b></div><div class="vhost" data-sev="${k}"></div></div>`).join('');
          for (const [k] of K.SEVERITIES)
            vselect(rows.querySelector(`[data-sev="${k}"]`), {
              options: [{ value: '', label: 'Leave empty' }, ...f.values.map((v) => ({ value: v, label: v }))],
              value: (link.severityMap || {})[k] || '',
              onChange: (v) => save({ severityMap: { ...(link.severityMap || {}), [k]: v } }),
            });
        };
        if (F.length)
          vselect(sub.querySelector('[data-h="sevf"]'), {
            options: [{ value: '', label: 'None' }, ...F.map((f) => ({ value: f.id, label: f.name, sub: f.values.slice(0, 4).join(' · ') }))],
            value: (link.severityField && link.severityField.id) || '',
            onChange: async (v) => {
              const f = F.find((x) => x.id === v);
              await save(f ? { severityField: { id: f.id, name: f.name }, severityMap: setup.severityDefaults[f.id], severityFieldChosen: true } : { severityField: null, severityMap: null, severityFieldChosen: true });
              drawSev();
            },
          });
        drawSev();
      };
      vselect(box.querySelector('.vh1'), {
        options: [{ value: '', label: 'Not linked' }, ...(c.projects || []).map((rp) => ({ value: rp.id, label: rp.name, sub: rp.identifier }))],
        value: link.projectId || '',
        placeholder: 'Redmine project',
        search: (c.projects || []).length > 7,
        onChange: async (v) => {
          const rp = (c.projects || []).find((x) => x.id === v);
          // a different Redmine project has different trackers / fields / members: start fresh
          for (const k of Object.keys(link)) delete link[k];
          await setLink(p.id, null);
          if (v) await save({ projectId: v, projectName: rp && rp.name });
          drawDetails(v);
        },
      });
      drawDetails(link.projectId);
    });

    // status out
    const statusOpts = (c.statuses || []).map((s) => ({ value: s.id, label: s.name, sub: s.isClosed ? 'closed' : '' }));
    $('rmOut').innerHTML = rowsHtml([
      ['Open', 'New issue reported', 'rmo-open'],
      ['Reopened', 'Failed retest', 'rmo-reopened'],
      ['Closed', 'Passed retest', 'rmo-closed'],
    ]);
    for (const k of ['open', 'reopened', 'closed'])
      vselect($('rmo-' + k), {
        options: [{ value: '', label: "Don't change the status" }, ...statusOpts],
        value: (c.statusOut || {})[k] || '',
        onChange: async (v) => saveRm({ statusOut: { ...((await getRm()).statusOut || {}), [k]: v || null } }),
      });

    // status in
    $('rmIn').innerHTML = rowsHtml((c.statuses || []).map((s) => [esc(s.name), s.isClosed ? 'closed status in Redmine' : '', 'rmi-' + s.id]));
    for (const st of c.statuses || [])
      vselect($('rmi-' + st.id), {
        options: MEANINGS,
        value: (c.statusIn || {})[st.id] || K.redmine.defaultCategory(st),
        onChange: async (v) => saveRm({ statusIn: { ...((await getRm()).statusIn || {}), [st.id]: v } }),
      });

    // priority
    const prioOpts = (c.priorities || []).map((p) => ({ value: p.id, label: p.name }));
    $('rmPrio').innerHTML = prioOpts.length
      ? rowsHtml(K.SEVERITIES.map(([k, l]) => [l, '', 'rmpr-' + k]))
      : '<div class="row"><p class="muted">This Redmine does not share its priority list — issues get Redmine\'s default priority.</p></div>';
    if (prioOpts.length)
      for (const [k] of K.SEVERITIES)
        vselect($('rmpr-' + k), {
          options: [{ value: '', label: 'Redmine default' }, ...prioOpts],
          value: (c.priority || {})[k] || '',
          onChange: async (v) => saveRm({ priority: { ...((await getRm()).priority || {}), [k]: v || null } }),
        });

    // switches
    for (const [id, key] of [
      ['rmSyncSave', 'syncOnSave'],
      ['rmSyncStatus', 'syncStatus'],
      ['rmAttach', 'attach'],
    ])
      $(id).setAttribute('aria-checked', String(c[key] !== false));
  }

  async function setLink(projectId, link) {
    const ps = await db.getProjects();
    const p = ps.find((x) => x.id === projectId);
    if (!p) return;
    p.redmine = link ? { ...(p.redmine || {}), ...link } : null;
    await db.saveProjects(ps);
    $('rmSaved').hidden = false;
    clearTimeout(rmSavedTimer);
    rmSavedTimer = setTimeout(() => ($('rmSaved').hidden = true), 1500);
  }

  $('rmShow').onclick = () => {
    const k = $('rmKey');
    k.type = k.type === 'password' ? 'text' : 'password';
    $('rmShow').textContent = k.type === 'password' ? 'Show' : 'Hide';
  };
  $('rmConn').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $('rmUrl').value.trim().replace(/\/+$/, '');
    const key = $('rmKey').value.trim();
    const err = (m) => {
      $('rmErr').textContent = m;
      $('rmErr').hidden = false;
    };
    if (!/^https?:\/\/[^\s/]+/i.test(url)) return err('Enter the full address, starting with https://');
    if (!/^[0-9a-f]{20,}$/i.test(key)) return err('That does not look like a Redmine API key (a long string of letters a–f and digits).');
    $('rmTest').disabled = true;
    $('rmTest').textContent = 'Testing…';
    $('rmErr').hidden = true;
    try {
      const r = await send('redmineTest', { url, key });
      const cur = await getRm();
      const first = !cur.statuses;
      await saveRm({
        url,
        key,
        enabled: true,
        user: r.user,
        projects: r.meta.projects,
        statuses: r.meta.statuses,
        priorities: r.meta.priorities,
        // keep the tester's choices; fill in defaults only where nothing was chosen yet
        statusOut: first ? r.defaults.statusOut : { ...r.defaults.statusOut, ...(cur.statusOut || {}) },
        statusIn: first ? r.defaults.statusIn : { ...r.defaults.statusIn, ...Object.fromEntries(Object.entries(cur.statusIn || {}).filter(([, v]) => v)) },
        priority: first ? r.defaults.priority : { ...r.defaults.priority, ...(cur.priority || {}) },
        testedAt: K.isoLocal(),
      });
      toast(`Connected as ${r.user.name} · ${r.meta.projects.length} project${r.meta.projects.length === 1 ? '' : 's'} visible`);
      renderRedmine();
    } catch (ex) {
      err(ex.message);
    } finally {
      $('rmTest').disabled = false;
      $('rmTest').textContent = 'Test & save';
    }
  });
  $('rmDisconnect').onclick = async () => {
    if (!confirm('Remove the Redmine address and API key from this browser? Links on existing issues are kept.')) return;
    const c = await getRm();
    await db.setMeta('redmine', { ...c, key: '', user: null, enabled: false });
    toast('Redmine disconnected');
    renderRedmine();
  };
  for (const [id, key] of [
    ['rmSyncSave', 'syncOnSave'],
    ['rmSyncStatus', 'syncStatus'],
    ['rmAttach', 'attach'],
  ])
    $(id).addEventListener('click', () => {
      const b = $(id);
      const on = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(on));
      saveRm({ [key]: on });
    });

  // ---------- preferences (autosave) ----------
  async function renderPrefs() {
    const s = await db.getSettings();
    $('sRep').value = s.reporter || '';
    $('sRedact').setAttribute('aria-checked', String(!!s.autoRedact));
    $('sOutline').setAttribute('aria-checked', String(!!s.outlineElement));
  }
  let savedTimer = 0;
  async function savePrefs() {
    const rep = $('sRep').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!rep) return toast('Your initials are needed for issue IDs.', 'err');
    const s = await db.getSettings();
    await db.saveSettings({ ...s, reporter: rep, autoRedact: $('sRedact').getAttribute('aria-checked') === 'true', outlineElement: $('sOutline').getAttribute('aria-checked') === 'true' });
    $('sRep').value = rep;
    $('savedTag').hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($('savedTag').hidden = true), 1600);
  }
  $('sRep').addEventListener('change', savePrefs);
  for (const id of ['sRedact', 'sOutline'])
    $(id).addEventListener('click', () => {
      const b = $(id);
      b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true'));
      savePrefs();
    });

  // ---------- backup ----------
  $('doBackup').onclick = async () => {
    $('doBackup').disabled = true;
    try {
      const r = await send('backup');
      toast(`Backup of ${r.count} issue${r.count === 1 ? '' : 's'} saved to Downloads`);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      $('doBackup').disabled = false;
    }
  };
  $('doRestore').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const r = await send('restore', { text: await f.text() });
      toast(`Restored: ${r.added} added, ${r.updated} updated`);
      renderProjects();
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  route();
})();
