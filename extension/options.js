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
    const sec = ['projects', 'preferences', 'backup'].includes(section) ? section : 'projects';
    for (const s of ['projects', 'preferences', 'backup']) $('s-' + s).hidden = s !== sec;
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === sec ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (sec === 'projects') {
      renderProjects();
      if (sub === 'new') openForm(null);
    }
    if (sec === 'preferences') renderPrefs();
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
