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
    const SECTIONS = ['rounds', 'projects', 'preferences', 'backup'];
    const sec = SECTIONS.includes(section) ? section : 'projects';
    for (const s of SECTIONS) $('s-' + s).hidden = s !== sec;
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === sec ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (sec === 'projects') {
      renderProjects();
      if (sub === 'new') openForm(null);
    }
    if (sec === 'preferences') renderPrefs();
    if (sec === 'rounds') renderRounds();
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
