export const PROJECT_STATUS = Object.freeze({ planning: 'Perencanaan', active: 'Aktif', on_hold: 'Ditunda', completed: 'Selesai', archived: 'Diarsipkan' });
export const TASK_STATUS = Object.freeze({ todo: 'Belum dimulai', in_progress: 'Dikerjakan', review: 'Ditinjau', done: 'Selesai' });
export const PRIORITY = Object.freeze({ low: 'Rendah', medium: 'Sedang', high: 'Tinggi', critical: 'Kritis' });
export const ROLE = Object.freeze({ admin: 'Admin', manager: 'Manajer', member: 'Anggota' });

export function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function parseLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function todayISO(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(value, days) {
  const date = parseLocalDate(value);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

export function daysUntil(value, today = todayISO()) {
  const date = parseLocalDate(value);
  const base = parseLocalDate(today);
  if (!date || !base) return 0;
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())) / 86400000);
}

export function formatDate(value, options = {}) {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', ...options }).format(date) : 'Belum diatur';
}

export function isOverdue(task, today = todayISO()) {
  return Boolean(parseLocalDate(task.dueDate) && task.dueDate < today && task.status !== 'done');
}

export function progress(project) {
  if (!(project.taskTotal > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((project.taskDone / project.taskTotal) * 100)));
}

export function initials(name = '') {
  return String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase() || '?';
}

export function appError(code, details = {}) {
  return Object.assign(new Error(code), { code, ...details });
}

export function sameVersion(current, expected) {
  return current === expected || (current != null && expected != null && typeof current.isEqual === 'function' && current.isEqual(expected));
}

export function canAccessProject(project, user) {
  return Boolean(project && user?.id && (project.memberIds?.includes(user.id) || user.role === 'admin'));
}

// Captures identity AND revision: a logout/login of the same account also invalidates old forms.
export function serviceOperation(currentUser, revision = () => currentUser()?.id, { signal, onProgress } = {}) {
  const actor = currentUser();
  if (!actor?.id) throw appError('unauthenticated');
  const version = revision();
  const operation = { actorId: actor.id, actor: { ...actor }, onProgress,
    assertActive() {
      if (signal?.aborted || currentUser()?.id !== actor.id || revision() !== version) throw appError('session-changed');
    } };
  operation.assertActive();
  return operation;
}

export function reportProgress(operation, stage, completed, total) {
  operation?.onProgress?.({ stage, completed, total });
}

export function partialFailure(error, stage, completed, total) {
  if (!completed && error?.code === 'session-changed') return error;
  return appError('partial-operation', { cause: error, stage, completed, total, retryable: true });
}

export function translateError(error) {
  const code = String(error?.code ?? '').replace(/^firestore\//, '');
  const messages = {
    'permission-denied': 'Anda tidak memiliki izin untuk tindakan ini. Periksa keanggotaan atau minta pemilik proyek membantu.',
    unauthenticated: 'Sesi berakhir. Silakan masuk kembali.',
    unavailable: 'Firebase belum terjangkau. Periksa internet, lalu coba kembali.',
    'resource-exhausted': 'Kuota Firebase telah mencapai batas. Hentikan percobaan berulang dan coba lagi setelah kuota dipulihkan.',
    'failed-precondition': 'Indeks atau konfigurasi Firestore belum siap. Periksa firestore.indexes.json dan Firebase Console.',
    'not-found': 'Data tidak ditemukan. Mungkin sudah dihapus atau akses Anda berubah.',
    aborted: 'Data berubah saat disimpan. Muat ulang sebelum mencoba kembali.',
    'session-changed': 'Sesi akun atau halaman telah berubah. Penyimpanan dibatalkan; buka kembali proyek dari akun yang benar.',
    'project-has-tasks': 'Tugas proyek belum seluruhnya dihapus. Coba lanjutkan penghapusan atau hitung ulang counter.',
    'partial-operation': 'Sebagian perubahan sudah disimpan. Jangan ulangi dari formulir lama; muat ulang lalu lanjutkan tindakan yang sama untuk menyelesaikan sisanya.',
    'partial-failure': 'Proses berhenti setelah sebagian data tersimpan. Muat ulang, lalu lanjutkan tindakan pemeliharaan yang sama. Data yang sudah selesai tidak perlu dibuat ulang.',
    'project-busy': 'Proyek sedang disinkronkan atau dihapus. Tunggu atau lanjutkan tindakan pemeliharaan yang sama.',
    'task-busy': 'Tugas sedang dihapus. Muat ulang atau lanjutkan penghapusan.',
    'placeholder-in-use': 'Anggota contoh masih digunakan proyek atau tugas. Hapus dari keanggotaan dan penugasan terlebih dahulu.',
    'storage-unavailable': 'Penyimpanan browser tidak tersedia. Izinkan penyimpanan situs atau gunakan jendela biasa.',
    'config-missing': 'Konfigurasi Firebase belum diisi. Lengkapi js/core/firebase-config.js terlebih dahulu.',
    'profile-missing': 'Akun berhasil masuk, tetapi profil belum tersedia. Lengkapi profil untuk melanjutkan.',
    'auth/invalid-credential': 'Email atau kata sandi tidak cocok. Periksa kembali atau gunakan lupa kata sandi.',
    'auth/wrong-password': 'Email atau kata sandi tidak cocok. Periksa kembali atau gunakan lupa kata sandi.',
    'auth/user-not-found': 'Email atau kata sandi tidak cocok. Periksa kembali atau gunakan lupa kata sandi.',
    'auth/invalid-email': 'Format email tidak valid. Periksa alamat email Anda.',
    'auth/email-already-in-use': 'Email tidak dapat didaftarkan. Coba masuk atau atur ulang kata sandi.',
    'auth/weak-password': 'Kata sandi belum memenuhi kebijakan Firebase. Gunakan minimal 8 karakter dan ikuti kebijakan proyek.',
    'auth/password-does-not-meet-requirements': 'Kata sandi belum memenuhi kebijakan proyek. Periksa kebijakan di Firebase Authentication.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu beberapa saat sebelum mencoba kembali.',
    'auth/network-request-failed': 'Koneksi terputus. Periksa internet sebelum mencoba kembali.',
    'auth/user-disabled': 'Akun dinonaktifkan. Hubungi admin tim Anda.',
    'auth/operation-not-allowed': 'Email/Password belum aktif. Aktifkan provider ini di Firebase Authentication.',
    'auth/unauthorized-domain': 'Domain ini belum diizinkan. Tambahkan ke Authorized domains di Firebase Authentication.',
    'auth/invalid-api-key': 'API key Firebase tidak valid. Periksa konfigurasi Web App.',
    'auth/web-storage-unsupported': 'Browser memblokir penyimpanan sesi. Izinkan data situs atau gunakan jendela biasa.',
  };
  if (error?.name === 'TypeError' && globalThis.navigator?.onLine === false) return messages.unavailable;
  return messages[code] ?? 'Tindakan belum berhasil. Coba kembali; jika berulang, periksa konfigurasi Firebase bersama admin.';
}

export function readPreference(key, fallback = null) {
  try { return localStorage.getItem(`niri:${key}`) ?? fallback; } catch { return fallback; }
}
export function writePreference(key, value) {
  try { localStorage.setItem(`niri:${key}`, String(value)); return true; } catch { return false; }
}
