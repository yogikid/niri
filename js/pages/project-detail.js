import { PROJECT_STATUS, PRIORITY, ROLE, escapeHTML as esc, progress, formatDate, translateError } from '../core/utils.js';
import { avatar, confirmAction, emptyState, icon, skeleton, toast, windowDots } from '../components/ui.js';
import { openProjectForm } from '../components/project-form.js';
import { renderTasks } from './tasks.js';

export function renderProjectDetail(root, { id, projects, repository, user, signal, setConnection, tasks, comments }) {
  let taskDispose = () => {}; let taskController = null;
  const stopTasks=()=>{taskController?.abort();taskDispose();taskDispose=()=>{};taskController=null;};
  let current = null; let active = true; let people = new Map([[user.id, user]]); let connection = { fromCache: true, pending: false };
  root.innerHTML = skeleton(1);
  const draw = () => {
    const previousTasks = root.querySelector('[data-project-tasks]');
    if (previousTasks) previousTasks.remove();
    if (!current) { stopTasks(); root.innerHTML = emptyState({ title: 'Proyek tidak ditemukan', description: 'Proyek mungkin telah dihapus. Kembali ke daftar untuk memilih proyek lain.', action: '<a href="#/projects" class="btn">Kembali ke proyek</a>' }); return; }
    const p = current; const percentage = progress(p);
    root.innerHTML = `<a href="#/projects" class="row text-small" style="margin-bottom:24px">${icon('back')}Semua proyek</a><div class="page-heading"><div><span class="eyebrow">${esc(p.code)} / Detail proyek</span><h1>${esc(p.name)}</h1><p>Tujuan, tenggat, dan orang-orang di balik rencana ini.</p></div><div class="row wrap">${projects.canEdit(p) ? `<button type="button" class="btn" data-edit>${icon('edit')}Ubah proyek</button>` : ''}${projects.canDelete(p) ? `<button type="button" class="btn btn-danger" data-delete>${icon('trash')}Hapus</button>` : ''}</div></div>
      <div class="detail-grid"><div class="stack"><section class="window"><div class="window-bar">${windowDots()}<h2>Ringkasan proyek</h2></div><div class="window-body stack"><div class="row wrap"><span class="badge status-${esc(p.status)}"><span class="status-dot"></span>${esc(PROJECT_STATUS[p.status])}</span><span class="badge priority-${esc(p.priority)}">Prioritas ${esc(PRIORITY[p.priority])}</span></div><p class="detail-description">${esc(p.description || 'Belum ada deskripsi proyek.')}</p><dl class="detail-meta"><div><dt>Tanggal mulai</dt><dd>${formatDate(p.startDate)}</dd></div><div><dt>Tenggat</dt><dd>${formatDate(p.dueDate)}</dd></div><div><dt>Pemilik</dt><dd>${esc(people.get(p.ownerId)?.name ?? p.ownerId)}</dd></div><div><dt>Jumlah anggota</dt><dd>${p.memberIds.length} orang</dd></div></dl><div class="card-progress"><div class="row spread"><span>Progres proyek</span><strong>${percentage}%</strong></div><div class="progress" role="progressbar" aria-label="Progres proyek" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percentage}%" class="${percentage === 0 ? 'empty' : percentage === 100 ? 'complete' : ''}"></span></div><span class="text-small muted">${p.taskDone} dari ${p.taskTotal} tugas selesai</span></div></div></section>
      </div>
      <aside class="window"><div class="window-bar">${windowDots()}<h2>Tim proyek · ${p.memberIds.length}</h2></div><div class="window-body">${p.memberIds.map((uid, index) => { const profile = people.get(uid); return `<div class="detail-member">${avatar(profile?.name ?? uid.slice(0, 2), index)}<div class="grow"><p>${esc(profile?.name ?? uid)}</p><span>${uid === p.ownerId ? 'Pemilik proyek' : esc(ROLE[profile?.role] ?? 'Anggota')}${profile?.isPlaceholder ? ' · Profil demo' : ''}</span></div>${uid === p.ownerId ? icon('flag') : ''}</div>`; }).join('')}</div></aside></div>`;
    if (tasks && (p.memberIds.includes(user.id) || user.role==='admin')) {
      if (previousTasks) root.append(previousTasks);
      else {
        taskController = new AbortController();
        const section = document.createElement('section'); section.dataset.projectTasks = ''; section.className = 'project-task-section'; root.append(section);
        taskDispose = renderTasks(section, { tasks, comments, projects, repository, user, signal: taskController.signal, setConnection, projectId: p.id, embedded: true });
      }
    } else { stopTasks(); }
    setConnection(connection);
  };
  const off = projects.watchOne(id, (data) => { if (active && !signal.aborted) { current = data.item; connection = data; draw(); } }, (error) => {
    if (!active || signal.aborted) return; current = null; stopTasks();
    root.innerHTML = emptyState({ title: 'Proyek belum dapat dibuka', description: translateError(error), symbol: 'lock', action: '<a href="#/projects" class="btn">Kembali ke proyek</a>' });
  });
  repository.listProfiles({ pageSize: 60 }).then((profiles) => { if (active && !signal.aborted) { people = new Map(profiles.map((profile) => [profile.id, profile])); if (current) draw(); } }).catch(() => {});
  root.addEventListener('click', async (event) => {
    if (!current) return;
    if (event.target.closest('[data-edit]')) openProjectForm({ project: current, projects, repository, user, signal });
    if (event.target.closest('[data-delete]')) {
      const target = { ...current };
      let commentCount = 0;
      try { const counts = await projects.countChildren(target.id); commentCount = counts?.comments ?? null; } catch { commentCount = null; }
      if (signal.aborted) return;
      const confirmed = await confirmAction({ title: 'Hapus proyek ini?', message: `Proyek “${target.name}”, ${target.taskTotal} tugas, dan ${commentCount === null ? 'seluruh' : commentCount} komentar terkait akan dihapus permanen. Proses bertahap tidak dapat dibatalkan.`, label: 'Ya, hapus proyek', signal });
      if (!confirmed || signal.aborted) return;
      try { toast('Menghapus data terkait. Mohon tunggu hingga selesai.'); await projects.remove(target.id, { signal, onProgress: ({completed,total}) => { const button = root.querySelector('[data-delete]'); if (button) button.textContent = total ? `Menghapus ${completed}/${total}…` : `Menghapus · ${completed} selesai…`; } }); toast('Proyek berhasil dihapus.'); if (!signal.aborted) location.hash = '#/projects'; }
      catch (error) { if (!signal.aborted) toast(translateError(error), 'error'); }
    }
  }, { signal });
  const dispose = () => { active = false; off(); stopTasks(); }; signal.addEventListener('abort', dispose, { once: true }); return dispose;
}
