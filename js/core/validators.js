import { PROJECT_STATUS, TASK_STATUS, PRIORITY, ROLE, parseLocalDate } from './utils.js';

export class ValidationError extends Error {
  constructor(fields) { super('Periksa kembali isian formulir.'); this.name = 'ValidationError'; this.fields = fields; }
}

export function validateProject(input) {
  const fields = {};
  const data = {
    name: String(input.name ?? '').trim(),
    description: String(input.description ?? '').trim(),
    status: input.status,
    priority: input.priority,
    startDate: input.startDate,
    dueDate: input.dueDate,
    memberIds: Array.isArray(input.memberIds) ? [...new Set(input.memberIds)] : [],
  };
  if (data.name.length < 3 || data.name.length > 80) fields.name = 'Nama proyek harus 3–80 karakter.';
  if (data.description.length > 2000) fields.description = 'Deskripsi maksimal 2.000 karakter.';
  if (!Object.hasOwn(PROJECT_STATUS, data.status)) fields.status = 'Pilih status proyek yang tersedia.';
  if (!Object.hasOwn(PRIORITY, data.priority)) fields.priority = 'Pilih prioritas yang tersedia.';
  if (!parseLocalDate(data.startDate)) fields.startDate = 'Masukkan tanggal mulai yang valid (tahun 1900–9999).';
  if (!parseLocalDate(data.dueDate)) fields.dueDate = 'Masukkan tenggat yang valid (tahun 1900–9999).';
  else if (!fields.startDate && data.dueDate < data.startDate) fields.dueDate = 'Tenggat tidak boleh sebelum tanggal mulai.';
  if (data.memberIds.length > 20 || data.memberIds.some((id) => typeof id !== 'string' || !id.length || id.length > 128 || id.includes('/'))) fields.memberIds = 'Pilih maksimal 20 anggota dengan ID yang valid.';
  if (typeof input.name !== 'string') fields.name = 'Nama proyek harus berupa teks.';
  if (input.description !== undefined && typeof input.description !== 'string') fields.description = 'Deskripsi harus berupa teks.';
  if (!Array.isArray(input.memberIds)) fields.memberIds = 'Daftar anggota tidak valid.';
  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
}

export function validateAuth(input, mode = 'login') {
  const data = {
    name: String(input.name ?? '').trim(), email: String(input.email ?? '').trim().toLowerCase(),
    password: String(input.password ?? ''), confirmPassword: String(input.confirmPassword ?? ''),
    trusted: Boolean(input.trusted),
  };
  const fields = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 254) fields.email = 'Masukkan alamat email yang valid.';
  if (mode !== 'reset' && !data.password) fields.password = 'Kata sandi wajib diisi.';
  if (mode === 'register') {
    if (data.name.length < 2 || data.name.length > 60) fields.name = 'Nama harus 2–60 karakter.';
    if (data.password.length < 8 || data.password.length > 128) fields.password = 'Gunakan kata sandi 8–128 karakter.';
    if (data.confirmPassword !== data.password) fields.confirmPassword = 'Konfirmasi kata sandi belum sama.';
  }
  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
}

export function validId(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128 && !value.includes('/');
}

export function validateTask(input) {
  const fields = {};
  const tags = Array.isArray(input.tags) ? input.tags.map((tag) => typeof tag === 'string' ? tag.trim() : tag) : [];
  const data = {
    projectId: input.projectId, title: typeof input.title === 'string' ? input.title.trim() : '',
    description: input.description === undefined ? '' : input.description,
    assigneeId: input.assigneeId === '' || input.assigneeId == null ? null : input.assigneeId,
    status: input.status ?? 'todo', priority: input.priority ?? 'medium', dueDate: input.dueDate === '' || input.dueDate == null ? null : input.dueDate,
    estimateHours: input.estimateHours ?? 0, tags: [...new Set(tags)], position: input.position ?? 0,
  };
  if (!validId(data.projectId)) fields.projectId = 'Pilih proyek yang valid.';
  if (typeof input.title !== 'string' || data.title.length < 3 || data.title.length > 120) fields.title = 'Judul harus 3–120 karakter.';
  if (typeof data.description !== 'string' || data.description.length > 5000) fields.description = 'Deskripsi maksimal 5.000 karakter.';
  else data.description = data.description.trim();
  if (data.assigneeId !== null && !validId(data.assigneeId)) fields.assigneeId = 'Pilih anggota yang valid.';
  if (!Object.hasOwn(TASK_STATUS, data.status)) fields.status = 'Pilih status tugas yang tersedia.';
  if (!Object.hasOwn(PRIORITY, data.priority)) fields.priority = 'Pilih prioritas yang tersedia.';
  if (data.dueDate !== null && !parseLocalDate(data.dueDate)) fields.dueDate = 'Masukkan tenggat yang valid.';
  if (typeof data.estimateHours !== 'number' || !Number.isFinite(data.estimateHours) || data.estimateHours < 0 || data.estimateHours > 10000) fields.estimateHours = 'Estimasi harus angka 0–10.000 jam.';
  if (typeof data.position !== 'number' || !Number.isFinite(data.position) || Math.abs(data.position) > 1000000000) fields.position = 'Urutan tugas tidak valid.';
  if ((input.tags !== undefined && !Array.isArray(input.tags)) || tags.length > 10 || tags.some((tag) => typeof tag !== 'string' || !tag.length || tag.length > 30)) fields.tags = 'Maksimal 10 label, masing-masing 1–30 karakter.';
  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
}

export function validateComment(body) {
  if (typeof body !== 'string' || !body.trim() || body.trim().length > 500) throw new ValidationError({ body: 'Komentar harus 1–500 karakter.' });
  return body.trim();
}

export function validateRole(role) {
  if (!Object.hasOwn(ROLE, role)) throw new ValidationError({ role: 'Pilih peran yang tersedia.' });
  return role;
}

export function validateProfilePatch(input) {
  const data = {};
  if (Object.hasOwn(input, 'name')) data.name = validateProfileName(input.name);
  if (Object.hasOwn(input, 'avatarColor')) {
    if (typeof input.avatarColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.avatarColor)) throw new ValidationError({ avatarColor: 'Gunakan warna heksadesimal yang valid.' });
    data.avatarColor = input.avatarColor;
  }
  if (Object.hasOwn(input, 'role')) data.role = validateRole(input.role);
  return data;
}

export function validatePlaceholder(input) {
  const data = { name: validateProfileName(input.name), email: input.email ?? '', avatarColor: input.avatarColor, role: 'member', isPlaceholder: true };
  if (typeof data.email !== 'string' || data.email.length > 254 || (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) throw new ValidationError({ email: 'Masukkan email yang valid atau kosongkan.' });
  data.email = data.email.trim().toLowerCase();
  validateProfilePatch({ avatarColor: data.avatarColor });
  return data;
}

export function validateProfileName(name) {
  const result = String(name ?? '').trim();
  if (typeof name !== 'string' || result.length < 2 || result.length > 60) throw new ValidationError({ name: 'Nama harus 2–60 karakter.' });
  return result;
}
