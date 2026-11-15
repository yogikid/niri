import { PROJECT_STATUS, PRIORITY, escapeHTML as esc, todayISO, addDays, translateError } from '../core/utils.js';
import { icon, showModal, toast, showFieldErrors, setFormBusy } from './ui.js';

function options(values, selected) { return Object.entries(values).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join(''); }
function field(name, label, content, full = false) { return `<div class="field${full ? ' field-full' : ''}"><label for="project-${name}">${label}</label>${content}<span id="error-${name}" class="field-error" data-error="${name}" aria-live="polite"></span></div>`; }

export async function openProjectForm({ project = null, projects, repository, user, signal, onSaved }) {
  const today = todayISO();
  const value = project ?? { name: '', description: '', status: 'planning', priority: 'medium', startDate: today, dueDate: addDays(today, 14), memberIds: [user.id] };
  const dialog = showModal({ title: project ? 'Ubah proyek' : 'Proyek baru', signal, content: `
    <p class="dialog-note">${project ? 'Perbarui rencana, bukan tujuan besarnya.' : 'Mulai dari sebuah rencana. Progres menyusul.'} Kolom bertanda * wajib diisi.</p>
    <form id="project-form" novalidate>
      <div class="form-grid">
        ${field('name', 'Nama proyek *', `<input id="project-name" name="name" value="${esc(value.name)}" maxlength="80" required autofocus aria-describedby="error-name" placeholder="Contoh: Portal Akademik TRPL">`, true)}
        ${field('description', 'Deskripsi', `<textarea id="project-description" name="description" maxlength="2000" aria-describedby="error-description" placeholder="Apa yang ingin tim Anda capai?">${esc(value.description)}</textarea>`, true)}
        ${field('status', 'Status *', `<select id="project-status" name="status" aria-describedby="error-status">${options(PROJECT_STATUS, value.status)}</select>`)}
        ${field('priority', 'Prioritas *', `<select id="project-priority" name="priority" aria-describedby="error-priority">${options(PRIORITY, value.priority)}</select>`)}
        ${field('startDate', 'Tanggal mulai *', `<input type="date" id="project-startDate" name="startDate" value="${esc(value.startDate)}" min="1900-01-01" max="9999-12-31" required aria-describedby="error-startDate">`)}
        ${field('dueDate', 'Tenggat *', `<input type="date" id="project-dueDate" name="dueDate" value="${esc(value.dueDate)}" min="1900-01-01" max="9999-12-31" required aria-describedby="error-dueDate">`)}
        <fieldset class="fieldset field-full"><legend>Anggota proyek</legend><p class="text-small muted">Pemilik selalu menjadi anggota. Maksimal 20 orang.</p><div id="member-picker" class="member-picker"><p class="text-small">Memuat profil anggota…</p></div><span data-error="memberIds" class="field-error" aria-live="polite"></span></fieldset>
      </div>
      <p id="project-form-error" class="field-error" role="alert"></p>
      <div class="dialog-actions"><button type="button" class="btn" data-cancel>Batal</button><button type="submit" class="btn btn-dark">${icon('check')}${project ? 'Simpan perubahan' : 'Buat proyek'}</button></div>
    </form>` });
  if (!dialog) return null;
  const form = dialog.querySelector('form'); const picker = dialog.querySelector('#member-picker');
  let profiles = [];
  const ownerId = project?.ownerId ?? user.id;
  const selected = new Set(value.memberIds);
  form.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  let membersReady = false; let membersFailed = false;
  const submit = form.querySelector('[type=submit]'); submit.disabled = true;
  const renderPicker = () => {
    const known = new Map(profiles.map((profile) => [profile.id, profile]));
    if (!known.has(user.id)) known.set(user.id, user);
    for (const id of selected) if (!known.has(id)) known.set(id, { id, name: id });
    picker.innerHTML = [...known.values()].map((profile, index) => `<label class="checkbox-label" for="member-${index}"><input id="member-${index}" type="checkbox" name="memberIds" value="${esc(profile.id)}"${selected.has(profile.id) || profile.id === ownerId ? ' checked' : ''}${profile.id === ownerId ? ' disabled' : ''}><span class="grow">${esc(profile.name)}${profile.isPlaceholder ? ' · demo' : ''}${profile.id === ownerId ? ' · pemilik' : ''}</span></label>`).join('');
    if (profiles.length === 60) picker.insertAdjacentHTML('beforeend', '<p class="text-small muted">Menampilkan 60 profil pertama. Anggota terpilih tetap dipertahankan.</p>');
  };
  try { profiles = await repository.listProfiles({ pageSize: 60 }); if (signal?.aborted || !dialog.isConnected) return dialog; renderPicker(); membersReady = true; submit.disabled = false; }
  catch (error) {
    if (signal?.aborted || !dialog.isConnected) return dialog;
    renderPicker();
    const note = document.createElement('p'); note.className = 'field-error'; note.textContent = `${translateError(error)} Daftar anggota tidak dapat diubah saat ini.`; picker.append(note);
    picker.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    membersReady = true; membersFailed = true; submit.disabled = false;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!membersReady || form.getAttribute('aria-busy') === 'true') return;
    showFieldErrors(form); const errorBox = form.querySelector('#project-form-error'); errorBox.textContent = '';
    const data = Object.fromEntries(new FormData(form));
    const editable = [...picker.querySelectorAll('input:not(:disabled)')];
    data.memberIds = membersFailed ? [...selected] : [ownerId, ...editable.filter((input) => input.checked).map((input) => input.value)];
    setFormBusy(form, true);
    try {
      const result = project ? await projects.update(project.id, { ...data, expectedUpdatedAt: project.updatedAt }, { signal }) : await projects.create(data, { signal });
      if (!signal?.aborted) { dialog.close(); toast(project ? 'Perubahan proyek tersimpan.' : 'Proyek baru berhasil dibuat.'); onSaved?.(result); }
    } catch (error) {
      if (dialog.isConnected) {
        showFieldErrors(form, error);
        if (!error.fields) errorBox.textContent = translateError(error);
      }
    } finally { if (form.isConnected) setFormBusy(form, false); }
  });
  return dialog;
}
