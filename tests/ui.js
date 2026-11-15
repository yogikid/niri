// NiRi: fixture UI khusus test, bukan Mode Demo Lokal dan tidak tersambung Firebase.
import { Repository } from '../js/data/repository.js';
import { LocalAdapter } from '../js/data/local-adapter.js';
import { ProjectService } from '../js/services/project-service.js';
import { Router } from '../js/core/router.js';
import { todayISO, addDays, translateError } from '../js/core/utils.js';
import { renderShell } from '../js/components/shell.js';
import { renderProjects } from '../js/pages/projects.js';
import { renderProjectDetail } from '../js/pages/project-detail.js';
import { renderSettings } from '../js/pages/settings.js';
import { toast } from '../js/components/ui.js';

const key = 'niri:ui-test-only';
const root = document.querySelector('#app');
const user = { id: 'test-ayu', name: 'Ayu Prameswari', email: 'ayu@example.test', role: 'admin' };
const repository = new Repository(new LocalAdapter({ storage: sessionStorage, key }));
const projects = new ProjectService(repository, () => user);
const today = todayISO();
const fixtures = [
  ['Portal Akademik TRPL', 'Merancang pengalaman akademik yang lebih mudah untuk mahasiswa dan dosen.', 'active', 'high', 14],
  ['Website UMKM Nusantara', 'Membawa produk lokal lebih dekat ke pelanggan lewat etalase digital.', 'planning', 'medium', 30],
  ['Sistem Inventaris Kampus', 'Satu sumber data untuk inventaris laboratorium yang lebih tertata.', 'on_hold', 'critical', -3],
  ['Identitas Visual Himpunan', 'Wajah baru, semangat yang sama. Menyatukan komunikasi visual tim.', 'completed', 'low', -8],
  ['Aplikasi Bank Sampah', 'Mencatat kontribusi kecil untuk lingkungan yang lebih baik.', 'active', 'high', 7],
  ['Riset Pengalaman Pengguna', 'Mendengar, memahami, dan menemukan kebutuhan pengguna nyata.', 'planning', 'medium', 21],
];
await repository.createProfile(user.id, { ...user, isPlaceholder: false });
await repository.createProfile('test-bima', { name: 'Bima Saputra', email: 'bima@example.test', role: 'member', isPlaceholder: true });
await repository.createProfile('test-citra', { name: 'Citra Lestari', email: 'citra@example.test', role: 'member', isPlaceholder: true });
if (!(await projects.list()).items.length) {
  for (const [name, description, status, priority, offset] of fixtures) await projects.create({ name, description, status, priority, startDate: addDays(today, -20), dueDate: addDays(today, offset), memberIds: [user.id, 'test-bima', 'test-citra'] });
}
const router = new Router((route, signal) => {
  const main = renderShell(root, { user, page: route.page, signal, onLogout: () => { toast('Fixture lokal: tidak ada sesi Auth yang diubah.'); }, onSearch: () => document.querySelector('#project-search')?.focus() });
  const context = { repository, projects, user, signal, setConnection() {} };
  const cleanup = route.page === 'project-detail' ? renderProjectDetail(main, { ...context, id: route.params.id }) : route.page === 'settings' ? renderSettings(main, context) : renderProjects(main, context);
  const notice = document.createElement('p'); notice.className = 'alert'; notice.textContent = 'PENGUJIAN UI LOKAL — data fixture di sessionStorage, bukan Firestore. Jangan gunakan halaman ini sebagai bukti Auth atau Rules.'; root.querySelector('.topbar').after(notice);
  return cleanup;
}, () => ({ user }));
router.start();
window.addEventListener('unhandledrejection', (event) => { toast(translateError(event.reason), 'error'); });
