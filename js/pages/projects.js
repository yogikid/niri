import { PROJECT_STATUS, PRIORITY, escapeHTML as esc, progress, daysUntil, translateError, readPreference, writePreference } from '../core/utils.js';
import { filterProjects } from '../services/project-service.js';
import { avatar, emptyState, icon, skeleton, windowDots } from '../components/ui.js';
import { openProjectForm } from '../components/project-form.js';

function dueLabel(project) {
  if (project.status === 'completed') return `${icon('check')}Selesai`;
  if (project.status === 'archived') return `${icon('folder')}Diarsipkan`;
  const days = daysUntil(project.dueDate);
  return `${icon(days < 0 ? 'warning' : 'clock')}${days < 0 ? `Terlambat ${Math.abs(days)} hari` : days === 0 ? 'Tenggat hari ini' : `${days} hari lagi`}`;
}
export function projectCard(project, profiles = new Map()) {
  const percentage = progress(project);
  const members = project.memberIds.slice(0, 3).map((id, index) => avatar(profiles.get(id)?.name ?? id.slice(0, 2), index)).join('');
  return `<article class="project-card">
    <div class="project-card-bar">${windowDots()}<span class="mono">${esc(project.code)}</span></div>
    <div class="project-card-body">
      <div class="card-badges"><span class="badge status-${esc(project.status)}"><span class="status-dot" aria-hidden="true"></span>${esc(PROJECT_STATUS[project.status] ?? project.status)}</span><span class="badge priority-${esc(project.priority)}">${project.priority === 'critical' ? '! ' : project.priority === 'high' ? '↑ ' : '· '}${esc(PRIORITY[project.priority] ?? project.priority)}</span></div>
      <h2 class="card-title"><a href="#/projects/${encodeURIComponent(project.id)}">${esc(project.name)}</a></h2>
      <p class="card-description">${esc(project.description || 'Belum ada deskripsi. Setiap proyek besar dimulai dari langkah kecil.')}</p>
      <div class="card-progress"><div class="row spread"><span>Progres proyek</span><span class="mono">${percentage}%</span></div><div class="progress" role="progressbar" aria-label="Progres ${esc(project.name)}" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100"><span class="${percentage === 100 ? 'complete' : percentage === 0 ? 'empty' : ''}" style="width:${percentage}%"></span></div><span class="text-small muted">${Number(project.taskDone) || 0} dari ${Number(project.taskTotal) || 0} tugas selesai</span></div>
      <div class="card-footer"><div class="avatar-group" aria-label="${project.memberIds.length} anggota">${members}${project.memberIds.length > 3 ? `<span class="avatar">+${project.memberIds.length - 3}</span>` : ''}</div><span class="due-label${daysUntil(project.dueDate) < 0 && !['completed', 'archived'].includes(project.status) ? ' text-danger' : ''}">${dueLabel(project)}</span></div>
    </div>
    <a class="card-open" href="#/projects/${encodeURIComponent(project.id)}">Buka proyek ${icon('arrow')}</a>
  </article>`;
}

export function renderProjects(root, { projects, repository, user, signal, setConnection }) {
  // NiRi: 24 proyek per halaman + paling banyak 60 profil sekali per route; satu listener proyek.
  // Pencarian/filter/sort hanya pada halaman yang dimuat, ditandai jelas; bukan full-text Firestore.
  let off = () => {}; let active = true; let items = []; let cursor = null; let hasMore = false; let busy = true; let loadError = null;
  const cursors = [null]; let pageIndex = 0; let profiles = new Map([[user.id, user]]);
  const filters = { search: '', status: '', priority: '', sort: readPreference('project-sort', 'newest') };
  root.innerHTML = `<div class="page-heading"><div><span class="eyebrow">Ruang kerja / Proyek</span><h1>Rencana besar.<br>Langkah nyata.</h1><p>Semua proyek tim, satu tempat untuk bergerak maju.</p></div><button class="btn btn-dark btn-pill" data-create>${icon('plus')}Proyek baru</button></div>
    <div class="welcome-strip">${icon('sparkle')}<span><strong>Halo, ${esc(user.name.split(' ')[0])}!</strong> Siap menuntaskan satu langkah hari ini?</span><span class="mono">SEDIKIT DEMI SEDIKIT, SELESAI.</span></div>
    <div class="project-summary" id="project-summary" aria-live="polite"></div>
    <section aria-label="Daftar proyek"><div class="project-toolbar"><div class="status-tabs" aria-label="Filter status"><button class="status-tab" data-status="" aria-pressed="true">Semua proyek</button><button class="status-tab" data-status="active" aria-pressed="false">Aktif</button><button class="status-tab" data-status="planning" aria-pressed="false">Perencanaan</button><button class="status-tab" data-status="completed" aria-pressed="false">Selesai</button></div><div class="toolbar-controls">
      <div class="search-wrap"><label for="project-search" class="sr-only">Cari proyek pada halaman ini</label>${icon('search')}<input class="search-input" id="project-search" type="search" placeholder="Cari proyek…" autocomplete="off" maxlength="80"></div>
      <div class="field"><label for="priority-filter" class="sr-only">Filter prioritas</label><select id="priority-filter"><option value="">Semua prioritas</option value="critical">Kritis</option><option value="high">Tinggi</option><option value="medium">Sedang</option><option value="low">Rendah</option></select></div>
      <div class="field"><label for="project-sort" class="sr-only">Urutkan proyek</label><select id="project-sort"><option value="newest">Terbaru</option><option value="dueDate">Tenggat terdekat</option><option value="priority">Prioritas tertinggi</option><option value="progress">Progres tertinggi</option></select></div>
      <div class="field"><label for="status-filter" class="sr-only">Semua status</label><select id="status-filter"><option value="">Semua status</option>${Object.entries(PROJECT_STATUS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
    </div></div><p class="results-note" id="project-results-note" aria-live="polite">Memuat proyek…</p><div id="project-results">${skeleton()}</div><div class="pagination"><button type="button" class="btn btn-small" id="previous-page" disabled>${icon('back')}Sebelumnya</button><span id="page-label">Halaman 1</span><button type="button" class="btn btn-small" id="next-page" disabled>Berikutnya${icon('arrow')}</button></div></section>
    <footer class="page-footer"><span>NiRi — Pantau proyek. Tuntaskan tugas.</span><span>Ruang kecil untuk rencana besar ♡</span></footer>`;
  const results = root.querySelector('#project-results'); const summary = root.querySelector('#project-summary');
  const next = root.querySelector('#next-page'); const previous = root.querySelector('#previous-page');
  root.querySelector('#project-sort').value = filters.sort;
  const draw = () => {
    if (loadError) {
      summary.innerHTML = ''; root.querySelector('#project-results-note').textContent = '';
      results.innerHTML = emptyState({ title: 'Proyek belum dapat dimuat', description: translateError(loadError), symbol: 'warning', action: '<button class="btn" data-retry>Coba kembali</button>' });
      previous.disabled = pageIndex === 0; next.disabled = true; return;
    }
    const filtered = filterProjects(items, filters);
    const counts = [items.length, items.filter((p) => p.status === 'active').length, items.filter((p) => p.status === 'planning').length, items.filter((p) => p.status === 'completed').length];
    summary.innerHTML = ['Proyek di halaman ini', 'Sedang aktif', 'Dalam perencanaan', 'Sudah selesai'].map((label, index) => `<div class="summary-card"><div><span>${label}</span><strong>${counts[index].toString().padStart(2, '0')}</strong></div>${icon(['folder', 'flag', 'clock', 'checks'][index])}</div>`).join('');
    root.querySelector('#project-results-note').textContent = `${filtered.length} dari ${items.length} proyek · ${user.role === 'admin' ? 'Akses admin' : 'Proyek tempat Anda menjadi anggota'} · Pencarian dan urutan berlaku pada halaman ini.`;
    results.innerHTML = filtered.length ? `<div class="project-grid">${filtered.map((project) => projectCard(project, profiles)).join('')}</div>` : emptyState({ title: items.length ? 'Belum ada yang cocok' : 'Proyek pertamamu dimulai di sini', description: items.length ? 'Coba kata kunci lain atau atur ulang filter proyek.' : 'Beri nama sebuah rencana, tentukan tenggat, lalu ajak tim bergerak bersama.', action: `<button class="btn btn-primary" ${items.length ? 'data-reset' : 'data-create'}>${icon(items.length ? 'search' : 'plus')}${items.length ? 'Atur ulang filter' : 'Buat proyek pertama'}</button>` });
    next.disabled = busy || !hasMore; previous.disabled = busy || pageIndex === 0;
    root.querySelector('#page-label').textContent = `Halaman ${pageIndex + 1}`;
    root.querySelectorAll('[data-status]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.status === filters.status)));
    root.querySelector('#status-filter').value = filters.status;
  };
  const load = () => {
    off(); busy = true; loadError = null; next.disabled = true; previous.disabled = true; results.innerHTML = skeleton();
    off = projects.watch({ cursor: cursors[pageIndex], pageSize: 24 }, (page) => {
      if (!active || signal?.aborted) return;
      busy = false; loadError = null; items = page.items; cursor = page.cursor; hasMore = page.hasMore; draw(); setConnection(page);
    }, (error) => {
      if (!active || signal?.aborted) return;
      busy = false; items = []; hasMore = false; loadError = error; draw();
    });
  };
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-create')) openProjectForm({ projects, repository, user, signal });
    if (button.hasAttribute('data-reset')) { Object.assign(filters, { search: '', status: '', priority: '' }); root.querySelector('#project-search').value = ''; root.querySelector('#priority-filter').value = ''; draw(); }
    if (button.hasAttribute('data-retry')) load();
    if (button.hasAttribute('data-status')) { filters.status = button.dataset.status; draw(); }
  }, { signal });
  root.querySelector('#project-search').addEventListener('input', (event) => { filters.search = event.target.value; draw(); }, { signal });
  root.querySelector('#priority-filter').addEventListener('change', (event) => { filters.priority = event.target.value; draw(); }, { signal });
  root.querySelector('#status-filter').addEventListener('change', (event) => { filters.status = event.target.value; draw(); }, { signal });
  root.querySelector('#project-sort').addEventListener('change', (event) => { filters.sort = event.target.value; writePreference('project-sort', filters.sort); draw(); }, { signal });
  next.addEventListener('click', () => { if (busy || !hasMore) return; cursors[pageIndex + 1] = cursor; pageIndex++; load(); }, { signal });
  previous.addEventListener('click', () => { if (busy || pageIndex === 0) return; pageIndex--; load(); }, { signal });
  repository.listProfiles({ pageSize: 60 }).then((people) => { if (active && !signal?.aborted) { profiles = new Map(people.map((person) => [person.id, person])); if (!busy) draw(); } }).catch(() => { /* NiRi: proyek tetap dapat dibaca tanpa daftar nama profil. */ });
  draw(); load();
  const dispose = () => { active = false; off(); }; signal?.addEventListener('abort', dispose, { once: true });
  return dispose;
}
