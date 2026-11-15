import { appError, sameVersion } from '../core/utils.js';
import { validateTask, validateComment, validateProfilePatch, validatePlaceholder, validateProject } from '../core/validators.js';
import { newId, pageSize, requireActor, projectAccess, editableProject, writable, operationActor, activityData, normalizeActivity, collectSnapshot, exportData, importSeed } from './contracts.js';
import { resolveColor } from './colors.js';

export class LocalAdapter {
  constructor({ storage = globalThis.localStorage, key = 'niri:test-data', clock = () => new Date(), palette = {} } = {}) { Object.assign(this, { storage, key, clock, palette }); this.listeners = new Set(); this._lastTime = 0; }
  nextTimestamp(previous = null) { this._lastTime = Math.max(this.clock().getTime(), new Date(previous ?? 0).getTime() + 1, this._lastTime + 1); return new Date(this._lastTime).toISOString(); }
  read() {
    try { const data = JSON.parse(this.storage.getItem(this.key) ?? '{}'); for (const col of ['users', 'projects', 'tasks', 'comments', 'activity', 'seedMap']) data[col] ??= {}; return data; }
    catch { throw appError('storage-unavailable'); }
  }
  write(data, operation) {
    operation?.assertActive();
    try { this.storage.setItem(this.key, JSON.stringify(data)); } catch { throw appError('storage-unavailable'); }
    for (const emit of [...this.listeners]) emit();
  }
  audit(state, project, actor, entity, entityId, action, summary, timestamp = this.nextTimestamp(), extra = {}) {
    const id = newId(); state.activity[id] = { id, ...activityData({ projectId: project?.id ?? null, memberIds: project?.memberIds ?? [actor.id], actorId: actor.id, entity, entityId, action, summary, createdAt: timestamp, ...extra }) }; return id;
  }
  page(items, size, cursor, cap) { const count = pageSize(size, cap); const start = cursor ? Math.max(0, items.findIndex((d) => d.id === cursor) + 1) : 0; const slice = items.slice(start, start + count); return { items: structuredClone(slice), cursor: slice.at(-1)?.id ?? null, hasMore: start + count < items.length, fromCache: false, pending: false }; }
  watch(load, onData, onError = () => {}) { let active = true; const emit = () => { load().then((value) => { if (active) onData(value); }).catch((error) => { if (active) onError(error); }); }; this.listeners.add(emit); emit(); return () => { active = false; this.listeners.delete(emit); }; }
  async getProfile(id) { const item = this.read().users[id]; return item ? structuredClone({ ...item, id }) : null; }
  async createProfile(uid, input, operation) {
    operation?.assertActive(); const state = this.read(); if (state.users[uid]) return structuredClone(state.users[uid]);
    const role = Object.hasOwn(input, 'role') ? validateProfilePatch({ role: input.role }).role : 'member';
    const data = { ...validatePlaceholder({ ...input, avatarColor: resolveColor(input.avatarColor, this.palette) }), isPlaceholder: false, role }; const timestamp = this.nextTimestamp();
    state.users[uid] = { ...data, id: uid, createdAt: timestamp, updatedAt: timestamp }; this.audit(state, null, { id: uid }, 'user', uid, 'create', `Profil ${data.name} dibuat.`, timestamp); this.write(state, operation); return structuredClone(state.users[uid]);
  }
  async profilePage({ pageSize: size = 60, cursor = null } = {}) { return this.page(Object.entries(this.read().users).map(([id, d]) => ({ ...d, id })).sort((a, b) => a.id.localeCompare(b.id)), size, cursor, 60); }
  async listProfiles(options = {}) { return (await this.profilePage(options)).items; }
  async updateProfile(uid, input, actor, operation) {
    operation?.assertActive(); requireActor(actor); const state = this.read(); const current = state.users[uid]; if (!current) throw appError('not-found');
    const patch = validateProfilePatch(input); if (actor.id !== uid && actor.role !== 'admin' || actor.role !== 'admin' && Object.hasOwn(patch, 'role') || current.isPlaceholder && patch.role && patch.role !== 'member') throw appError('permission-denied');
    const timestamp = this.nextTimestamp(); state.users[uid] = { ...current, ...patch, updatedAt: timestamp }; this.audit(state, null, actor, 'user', uid, 'update', `Profil ${current.name} diperbarui.`, timestamp); this.write(state, operation); return structuredClone(state.users[uid]);
  }
  async createPlaceholder(input, actor, operation) { operation?.assertActive(); if (actor?.role !== 'admin') throw appError('permission-denied'); const data = validatePlaceholder({ ...input, avatarColor: resolveColor(input.avatarColor, this.palette) }); const state = this.read(); const id = `placeholder_${newId()}`; const timestamp = this.nextTimestamp(); state.users[id] = { ...data, id, createdAt: timestamp, updatedAt: timestamp }; this.audit(state, null, actor, 'user', id, 'create', `Anggota contoh ${data.name} dibuat.`, timestamp); this.write(state, operation); return structuredClone(state.users[id]); }
  async deletePlaceholder(uid, actor, operation) {
    operation?.assertActive(); if (actor?.role !== 'admin') throw appError('permission-denied'); const state = this.read(); const current = state.users[uid]; if (!current) throw appError('not-found'); if (!current.isPlaceholder) throw appError('permission-denied');
    if (Object.values(state.projects).some((p) => p.memberIds.includes(uid)) || Object.values(state.tasks).some((t) => t.assigneeId === uid)) throw appError('placeholder-in-use');
    delete state.users[uid]; this.audit(state, null, actor, 'user', uid, 'delete', `Anggota contoh ${current.name} dihapus.`); this.write(state, operation);
  }
  async getProject(id) { const data = this.read().projects[id]; return data ? structuredClone({ ...data, id }) : null; }
  async countProjectChildren(id, user) {
    requireActor(user); const state = this.read(); const project = state.projects[id]; if (!project) throw appError('not-found'); if (!projectAccess(project, user)) throw appError('permission-denied');
    const tasks = Object.values(state.tasks).filter((t) => t.projectId === id).length;
    const comments = Object.values(state.comments).filter((c) => c.projectId === id).length;
    return { tasks, comments };
  }
  async listProjects({ user, pageSize: size = 24, cursor = null } = {}) { requireActor(user); const items = Object.entries(this.read().projects).map(([id, data]) => ({ ...data, id })).filter((p) => projectAccess(p, user)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id)); return this.page(items, size, cursor, 24); }
  watchProjects(options, next, error) { return this.watch(() => this.listProjects(options), next, error); }
  watchProject(id, next, error) { return this.watch(async () => ({ item: await this.getProject(id), fromCache: false, pending: false }), next, error); }
  async createProject(input, operation) {
    operation?.assertActive(); const actor = operationActor(operation); const data = validateProject(input); const state = this.read(); const id = newId(); const timestamp = this.nextTimestamp();
    const project = { ...data, id, ownerId: actor.id, code: `NIRI-${id.slice(0, 6).toUpperCase()}`, taskTotal: 0, taskDone: 0, createdAt: timestamp, updatedAt: timestamp }; state.projects[id] = project; this.audit(state, project, actor, 'project', id, 'create', `Proyek ${data.name} dibuat.`, timestamp); this.write(state, operation); return structuredClone(project);
  }
  async updateProject(id, input, expected, operation, options = {}) {
    operation?.assertActive(); const state = this.read(); const current = state.projects[id]; if (!current) throw appError('not-found');
    const actor = operationActor(operation);
    if (!editableProject(current, actor)) throw appError('permission-denied'); writable(current); if (expected !== undefined && !sameVersion(current.updatedAt, expected)) throw appError('aborted');
    const merged = { ...current, ...input, memberIds: input.memberIds ?? current.memberIds };
    const data = validateProject(merged); if (!data.memberIds.includes(current.ownerId)) throw appError('permission-denied'); const timestamp = this.nextTimestamp(current.updatedAt); const next = { ...current, ...data, updatedAt: timestamp }; state.projects[id] = next;
    let completed = 0; const changed = JSON.stringify([...current.memberIds].sort()) !== JSON.stringify([...data.memberIds].sort());
    if (changed) {
      for (const task of Object.values(state.tasks).filter((t) => t.projectId === id)) { operation?.assertActive(); task.memberIds = [...next.memberIds]; if (!next.memberIds.includes(task.assigneeId)) task.assigneeId = null; task.updatedAt = timestamp; completed++; }
      // Body/author/creation timestamps are immutable; owner-only ACL maintenance is not a comment edit.
      for (const comment of Object.values(state.comments).filter((c) => c.projectId === id)) { comment.memberIds = [...next.memberIds]; completed++; }
    }
    this.audit(state, next, actor, 'project', id, 'update', `Proyek ${current.name} diperbarui.`, timestamp); this.write(state, operation); if (changed) (options.onProgress ?? operation?.onProgress)?.({ stage: 'acl', completed }); return structuredClone(next);
  }
  deleteComments(state, comments, project, actor, timestamp) {
    for (const comment of comments) { if (comment.authorId !== actor.id && project.ownerId !== actor.id) throw appError('permission-denied', { message: 'Komentar anggota lain hanya dapat dihapus penulis atau pemilik proyek. Minta pemilik proyek melanjutkan penghapusan.' }); delete state.comments[comment.id]; this.audit(state, project, actor, 'comment', comment.id, 'delete', 'Komentar dihapus bersama induknya.', timestamp); }
  }
  async deleteProject(id, operation, options = {}) {
    operation?.assertActive(); const state = this.read(); const project = state.projects[id]; if (!project) throw appError('not-found');
    const actor = operationActor(operation);
    if (project.ownerId !== actor.id) throw appError('permission-denied');
    const timestamp = this.nextTimestamp(); const comments = Object.entries(state.comments).filter(([, c]) => c.projectId === id).map(([cid, c]) => ({ ...c, id: cid })); this.deleteComments(state, comments, project, actor, timestamp);
    const tasks = Object.entries(state.tasks).filter(([, t]) => t.projectId === id); for (const [tid, t] of tasks) { operation?.assertActive(); delete state.tasks[tid]; this.audit(state, project, actor, 'task', tid, 'delete', `Tugas ${t.title} dihapus.`, timestamp); }
    delete state.projects[id]; this.audit(state, project, actor, 'project', id, 'delete', `Proyek ${project.name} dihapus.`, timestamp); this.write(state, operation); (options.onProgress ?? operation?.onProgress)?.({ stage: 'complete', completed: comments.length + tasks.length + 1 });
  }
  async getTask(id) { const item = this.read().tasks[id]; return item ? structuredClone({ ...item, id }) : null; }
  async listTasks({ user, projectId = null, pageSize: size = 150, cursor = null } = {}) { requireActor(user); const state = this.read(); const items = Object.entries(state.tasks).map(([id, d]) => ({ ...d, id })).filter((t) => (!projectId || t.projectId === projectId) && projectAccess(state.projects[t.projectId], user) && (user.role === 'admin' || t.memberIds?.includes(user.id))).sort((a, b) => a.position - b.position || String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id)); return this.page(items, size, cursor, 150); }
  watchTasks(options, next, error) { return this.watch(() => this.listTasks(options), next, error); }
  async saveTask({ id = null, data: input, actor, expectedUpdatedAt, seedMetadata = null, completedAt: seedCompletedAt }, operation) {
    operation?.assertActive(); requireActor(actor); const data = validateTask(input); const state = this.read(); const project = state.projects[data.projectId]; if (!project) throw appError('not-found'); if (!projectAccess(project, actor)) throw appError('permission-denied'); writable(project);
    if (data.assigneeId && !project.memberIds.includes(data.assigneeId)) throw appError('permission-denied'); const current = id ? state.tasks[id] : null; if (id && !current) throw appError('not-found'); if (current?.deleting) throw appError('task-busy'); if (current && data.projectId !== current.projectId) throw appError('permission-denied'); if (current && expectedUpdatedAt !== undefined && !sameVersion(current.updatedAt, expectedUpdatedAt)) throw appError('aborted');
    const tid = id ?? newId(); const timestamp = this.nextTimestamp(current?.updatedAt); const task = { ...data, id: tid, ownerId: project.ownerId, createdBy: current?.createdBy ?? actor.id, memberIds: [...project.memberIds], completedAt: data.status === 'done' ? current?.completedAt ?? (seedCompletedAt ? new Date(seedCompletedAt).toISOString() : timestamp) : null, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp, ...(current?.seedKey ? { seedKey: current.seedKey, seedActorId: current.seedActorId } : {}), ...seedMetadata };
    const taskTotal = project.taskTotal + (current ? 0 : 1); const taskDone = project.taskDone + (data.status === 'done' ? 1 : 0) - (current?.status === 'done' ? 1 : 0); if (taskDone < 0 || taskDone > taskTotal) throw appError('failed-precondition'); state.tasks[tid] = task;
    state.projects[data.projectId] = { ...project, taskTotal, taskDone, counterTaskId: tid, updatedAt: timestamp }; this.audit(state, project, actor, 'task', tid, !current ? 'create' : current.status !== data.status ? 'move' : 'update', `Tugas ${data.title} ${current ? 'diperbarui' : 'dibuat'}.`, timestamp); this.write(state, operation); return structuredClone(task);
  }
  async removeTask(id, actor, operation, options = {}) {
    operation?.assertActive(); requireActor(actor); const state = this.read(); const task = state.tasks[id]; if (!task) throw appError('not-found'); const p = state.projects[task.projectId]; if (!p || !projectAccess(p, actor) || actor.id !== task.createdBy && actor.id !== p.ownerId) throw appError('permission-denied'); writable(p);
    const timestamp = this.nextTimestamp(); const comments = Object.entries(state.comments).filter(([, c]) => c.taskId === id).map(([cid, c]) => ({ ...c, id: cid })); this.deleteComments(state, comments, p, actor, timestamp); delete state.tasks[id]; const taskTotal = p.taskTotal - 1; const taskDone = p.taskDone - (task.status === 'done' ? 1 : 0); if (taskTotal < 0 || taskDone < 0) throw appError('failed-precondition'); state.projects[task.projectId] = { ...p, taskTotal, taskDone, counterTaskId: id, updatedAt: timestamp }; this.audit(state, p, actor, 'task', id, 'delete', `Tugas ${task.title} dihapus.`, timestamp); this.write(state, operation); (options.onProgress ?? operation?.onProgress)?.({ stage: 'complete', completed: comments.length + 1 });
  }
  async listComments({ user, taskId = null, projectId = null, pageSize: size = 50, cursor = null } = {}) { requireActor(user); const state = this.read(); const items = Object.entries(state.comments).map(([id, d]) => ({ ...d, id })).filter((c) => (!taskId || c.taskId === taskId) && (!projectId || c.projectId === projectId) && projectAccess(state.projects[c.projectId], user) && (user.role === 'admin' || c.memberIds.includes(user.id))).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id)); return this.page(items, size, cursor, 50); }
  watchComments(options, next, error) { return this.watch(() => this.listComments(options), next, error); }
  async addComment({ taskId, body }, actor, operation) { operation?.assertActive(); requireActor(actor); const state = this.read(); const task = state.tasks[taskId]; if (!task) throw appError('not-found'); const p = state.projects[task.projectId]; if (!projectAccess(p, actor)) throw appError('permission-denied'); writable(p); if (task.deleting) throw appError('task-busy'); const timestamp = this.nextTimestamp(); const id = newId(); const comment = { id, taskId, projectId: task.projectId, authorId: actor.id, body: validateComment(body), memberIds: [...p.memberIds], createdAt: timestamp, updatedAt: timestamp }; state.comments[id] = comment; this.audit(state, p, actor, 'comment', id, 'create', `Komentar pada ${task.title} ditambahkan.`, timestamp); this.write(state, operation); return structuredClone(comment); }
  async removeComment(id, actor, operation) { operation?.assertActive(); requireActor(actor); const state = this.read(); const c = state.comments[id]; if (!c) throw appError('not-found'); const p = state.projects[c.projectId]; if (!projectAccess(p, actor) || actor.id !== c.authorId && actor.id !== p.ownerId) throw appError('permission-denied'); delete state.comments[id]; this.audit(state, p, actor, 'comment', id, 'delete', 'Komentar dihapus.'); this.write(state, operation); }
  async listActivity({ user, projectId = null, pageSize: size = 50, cursor = null } = {}) { requireActor(user); const items = Object.entries(this.read().activity).map(([id, d]) => normalizeActivity({ ...d, id })).filter((a) => (!projectId || a.projectId === projectId) && (user.role === 'admin' || a.memberIds.includes(user.id))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id)); return this.page(items, size, cursor, 50); }
  collectVisible(user, limits) { return collectSnapshot(this, user, limits); }
  exportVisible(user) { return exportData(this, user); }
  seedDemo(seed, actor, operation) { return importSeed(this, seed, actor, operation); }
  async seedIdentity(col, raw, actor, parentId, operation) {
    operation?.assertActive(); const state = this.read(); const key = `${col}:${raw.id}`; const registry = state.seedMap[actor.id] ?? {};
    let existing = state[col][registry[key]]; let id = registry[key];
    if (!existing) {
      const legacy = { projects: 'seed_proj_', tasks: 'seed_task_', comments: 'seed_comment_', activity: 'seed_act_' }[col];
      const entry = Object.entries(state[col]).find(([, d]) => d.seedActorId === actor.id && d.seedKey === key
        || legacy && d.seedKey === `${legacy}${raw.id}` && (col === 'projects' ? d.ownerId === actor.id
          : col === 'comments' ? d.taskId === parentId && state.projects[d.projectId]?.ownerId === actor.id
            : d.projectId === parentId && state.projects[d.projectId]?.ownerId === actor.id));
      if (entry) [id, existing] = entry;
    }
    id ??= col === 'users' ? `placeholder_${newId()}` : newId();
    if (existing && registry[key] !== id) { state.seedMap[actor.id] = { ...registry, [key]: id }; this.write(state, operation); }
    return { id, existing: existing ? structuredClone(existing) : null };
  }
  async seedCreate(col, id, data, metadata, actor, operation) {
    operation?.assertActive();
    if (col === 'tasks') {
      // Use the same atomic task/counter/audit path. Seed metadata/map persist with that write.
      const state = this.read(); const p = state.projects[data.projectId]; const timestamp = this.nextTimestamp(); const { completedAt, ...input } = data; const task = { ...validateTask(input), ...metadata, id, ownerId: p.ownerId, createdBy: actor.id, memberIds: [...p.memberIds], completedAt: data.status === 'done' ? completedAt?.toISOString() ?? timestamp : null, createdAt: timestamp, updatedAt: timestamp }; state.tasks[id] = task; state.projects[p.id] = { ...p, taskTotal: p.taskTotal + 1, taskDone: p.taskDone + (data.status === 'done' ? 1 : 0), counterTaskId: id, updatedAt: timestamp }; this.audit(state, p, actor, 'task', id, 'create', `Tugas ${data.title} dibuat.`, timestamp); state.seedMap[actor.id] ??= {}; state.seedMap[actor.id][metadata.seedKey] = id; this.write(state, operation); return structuredClone(task);
    }
    const state = this.read(); const timestamp = this.nextTimestamp(); let item;
    if (col === 'users') { item = { ...data, ...metadata, id, createdAt: timestamp, updatedAt: timestamp }; state.users[id] = item; this.audit(state, null, actor, 'user', id, 'create', `Anggota contoh ${data.name} dibuat.`, timestamp); }
    if (col === 'projects') { item = { ...data, ...metadata, id, taskTotal: 0, taskDone: 0, createdAt: timestamp, updatedAt: timestamp }; state.projects[id] = item; this.audit(state, item, actor, 'project', id, 'create', `Proyek ${data.name} dibuat.`, timestamp); }
    if (col === 'comments') { const task = state.tasks[data.taskId]; const p = state.projects[task.projectId]; item = { ...data, authorId: actor.id, ...metadata, id, projectId: task.projectId, memberIds: [...p.memberIds], createdAt: timestamp, updatedAt: timestamp }; state.comments[id] = item; this.audit(state, p, actor, 'comment', id, 'create', 'Komentar contoh ditambahkan.', timestamp); }
    if (col === 'activity') { item = { ...activityData({ ...data, createdAt: timestamp }), ...metadata, id }; state.activity[id] = item; }
    state.seedMap[actor.id] ??= {}; state.seedMap[actor.id][metadata.seedKey] = id; this.write(state, operation); return structuredClone(item);
  }
  async recountProjects(actor, operation, onProgress) { operation?.assertActive(); if (actor?.role !== 'admin') throw appError('permission-denied'); const state = this.read(); let completed = 0; for (const [id, p] of Object.entries(state.projects)) { operation?.assertActive(); const tasks = Object.values(state.tasks).filter((t) => t.projectId === id); state.projects[id] = { ...p, taskTotal: tasks.length, taskDone: tasks.filter((t) => t.status === 'done').length, updatedAt: this.nextTimestamp() }; completed++; } this.write(state, operation); onProgress?.({ stage: 'recount', completed }); return true; }
}
