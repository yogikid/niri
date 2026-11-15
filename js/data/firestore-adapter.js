import { appError, sameVersion } from '../core/utils.js';
import { validateTask, validateComment, validateProfilePatch, validatePlaceholder, validateProject } from '../core/validators.js';
import { PAGE_LIMITS, newId, pageSize, requireActor, projectAccess, editableProject, writable, operationActor, activityData, normalizeActivity, partialError, allPages, collectSnapshot, exportData, importSeed } from './contracts.js';
import { resolveColor } from './colors.js';

// SDK injection keeps this module executable with native Node and a contract fake.
// All project-child list queries are project-scoped for nonadmins: the parent Rules
// lookup is shared across a page, not 150 distinct parent lookups (10-read budget).
export class FirestoreAdapter {
  constructor(db, sdk, { clock = () => new Date(), palette = {} } = {}) { Object.assign(this, { db, sdk, clock, palette }); }
  ref(col, id) { return this.sdk.doc(this.db, col, id); }
  autoRef(col) { return this.sdk.doc(this.sdk.collection(this.db, col)); }
  document(snapshot) { return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null; }
  page(snapshot, size, normalize = (item) => item) { return { items: snapshot.docs.map((doc) => normalize(this.document(doc))), cursor: snapshot.docs.at(-1) ?? null, hasMore: snapshot.size === size, fromCache: snapshot.metadata?.fromCache ?? false, pending: snapshot.metadata?.hasPendingWrites ?? false }; }
  timestamp() { return this.sdk.serverTimestamp(); }
  audit(writer, project, actor, entity, entityId, action, summary, extra = {}) {
    const ref = this.autoRef('activity'); writer.set(ref, activityData({ projectId: project?.id ?? null, memberIds: project?.memberIds ?? [actor.id], actorId: actor.id, entity, entityId, action, summary, createdAt: this.timestamp(), ...extra })); return ref.id;
  }
  async commit(batch, operation) { operation?.assertActive(); await batch.commit(); operation?.assertActive(); }
  async readTx(tx, ref, operation) { const snap = await tx.get(ref); operation?.assertActive(); return snap; }
  async readDoc(ref, operation) { const snap = await this.sdk.getDoc(ref); operation?.assertActive(); return snap; }
  orderedQuery(col, filters, order, size, cursor) { const { query, collection, where, orderBy, limit, startAfter, documentId } = this.sdk; return query(collection(this.db, col), ...filters.map(([f, op, v]) => where(f, op, v)), ...order.map(([f, d]) => orderBy(f === '__name__' ? documentId() : f, d)), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize(size, PAGE_LIMITS[col]))); }
  async scanPage(col, { user, projectId, taskId, cursor = null } = {}, operation) {
    requireActor(user); const filters = []; if (projectId) filters.push(['projectId', '==', projectId]); if (taskId) filters.push(['taskId', '==', taskId]); if (user.role !== 'admin' && col !== 'users') filters.push(['memberIds', 'array-contains', user.id]);
    const snap = await this.sdk.getDocs(this.orderedQuery(col, filters, [['__name__', 'asc']], PAGE_LIMITS[col], cursor)); operation?.assertActive(); return this.page(snap, PAGE_LIMITS[col]);
  }

  async getProfile(uid) { return this.document(await this.sdk.getDoc(this.ref('users', uid))); }
  async createProfile(uid, input, operation) {
    operation?.assertActive(); const role = Object.hasOwn(input, 'role') ? validateProfilePatch({ role: input.role }).role : 'member';
    const data = { ...validatePlaceholder({ ...input, avatarColor: resolveColor(input.avatarColor, this.palette) }), role, isPlaceholder: false };
    return this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const ref = this.ref('users', uid); const current = await this.readTx(tx, ref, operation); if (current.exists()) return this.document(current); const next = { ...data, createdAt: this.timestamp(), updatedAt: this.timestamp() }; operation?.assertActive(); tx.set(ref, next); this.audit(tx, null, { id: uid }, 'user', uid, 'create', `Profil ${data.name} dibuat.`); return { ...next, id: uid }; });
  }
  async profilePage({ pageSize: size = 60, cursor = null } = {}) { const n = pageSize(size, 60); return this.page(await this.sdk.getDocs(this.orderedQuery('users', [], [['__name__', 'asc']], n, cursor)), n); }
  async listProfiles(options = {}) { return (await this.profilePage(options)).items; }
  async updateProfile(uid, input, actor, operation) {
    operation?.assertActive(); requireActor(actor); const patch = validateProfilePatch(input); if (actor.id !== uid && actor.role !== 'admin' || actor.role !== 'admin' && Object.hasOwn(patch, 'role')) throw appError('permission-denied');
    return this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const ref = this.ref('users', uid); const snap = await this.readTx(tx, ref, operation); if (!snap.exists()) throw appError('not-found'); const current = snap.data(); if (current.isPlaceholder && patch.role && patch.role !== 'member') throw appError('permission-denied'); const next = { ...patch, updatedAt: this.timestamp() }; operation?.assertActive(); tx.update(ref, next); this.audit(tx, null, actor, 'user', uid, 'update', `Profil ${current.name} diperbarui.`); return { ...current, ...next, id: uid }; });
  }
  async createPlaceholder(input, actor, operation) {
    operation?.assertActive(); if (actor?.role !== 'admin') throw appError('permission-denied'); const data = validatePlaceholder({ ...input, avatarColor: resolveColor(input.avatarColor, this.palette) }); const id = `placeholder_${newId()}`; const next = { ...data, createdAt: this.timestamp(), updatedAt: this.timestamp() }; const batch = this.sdk.writeBatch(this.db); batch.set(this.ref('users', id), next); this.audit(batch, null, actor, 'user', id, 'create', `Anggota contoh ${data.name} dibuat.`); await this.commit(batch, operation); return { ...next, id };
  }
  async deletePlaceholder(uid, actor, operation) {
    operation?.assertActive(); if (actor?.role !== 'admin') throw appError('permission-denied');
    const current = this.document(await this.readDoc(this.ref('users', uid), operation)); if (!current) throw appError('not-found'); if (!current.isPlaceholder) throw appError('permission-denied');
    for (const [col, field, op] of [['projects', 'memberIds', 'array-contains'], ['tasks', 'assigneeId', '==']]) { const snap = await this.sdk.getDocs(this.orderedQuery(col, [[field, op, uid]], [['__name__', 'asc']], 1)); operation?.assertActive(); if (!snap.empty) throw appError('placeholder-in-use'); }
    // No Auth user is deleted. Referential check is advisory; client transactions cannot
    // lock arbitrary query results. Rules never grant placeholder credentials/access.
    await this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const ref = this.ref('users', uid); const snap = await this.readTx(tx, ref, operation); if (!snap.exists() || !snap.data().isPlaceholder) throw appError('permission-denied'); operation?.assertActive(); tx.delete(ref); this.audit(tx, null, actor, 'user', uid, 'delete', `Anggota contoh ${snap.data().name} dihapus.`); });
  }

  async getProject(id) { return this.document(await this.sdk.getDoc(this.ref('projects', id))); }
  async countProjectChildren(id, user, operation) {
    requireActor(user); const tasks = await allPages((cursor) => this.scanPage('tasks', { user, projectId: id, cursor }, operation), operation);
    const comments = await allPages((cursor) => this.scanPage('comments', { user, projectId: id, cursor }, operation), operation);
    return { tasks: tasks.length, comments: comments.length };
  }
  projectQuery({ user, cursor = null, pageSize: size = 24 }) { requireActor(user); return this.orderedQuery('projects', user.role === 'admin' ? [] : [['memberIds', 'array-contains', user.id]], [['createdAt', 'desc'], ['__name__', 'asc']], size, cursor); }
  async listProjects(options) { const n = pageSize(options.pageSize, 24); return this.page(await this.sdk.getDocs(this.projectQuery({ ...options, pageSize: n })), n); }
  watchProjects(options, next, error) { const n = pageSize(options.pageSize, 24); return this.sdk.onSnapshot(this.projectQuery({ ...options, pageSize: n }), { includeMetadataChanges: true }, (snap) => next(this.page(snap, n)), error); }
  watchProject(id, next, error) { return this.sdk.onSnapshot(this.ref('projects', id), { includeMetadataChanges: true }, (snap) => next({ item: this.document(snap), fromCache: snap.metadata?.fromCache ?? false, pending: snap.metadata?.hasPendingWrites ?? false }), error); }
  async createProject(input, operation) {
    operation?.assertActive(); const actor = operationActor(operation); const ref = this.autoRef('projects'); const next = { ...validateProject(input), ownerId: actor.id, code: `NIRI-${ref.id.slice(0, 6).toUpperCase()}`, taskTotal: 0, taskDone: 0, createdAt: this.timestamp(), updatedAt: this.timestamp() }; const batch = this.sdk.writeBatch(this.db); batch.set(ref, next); this.audit(batch, { ...next, id: ref.id }, actor, 'project', ref.id, 'create', `Proyek ${next.name} dibuat.`); await this.commit(batch, operation); return { ...next, id: ref.id };
  }
  async updateProject(id, input, expected, operation, options = {}) {
    const progress = options.onProgress ?? operation?.onProgress; let committed = false; let completed = 0; let stage = 'project';
    try {
      const result = await this.sdk.runTransaction(this.db, async (tx) => {
        operation?.assertActive(); const ref = this.ref('projects', id); const snap = await this.readTx(tx, ref, operation); if (!snap.exists()) throw appError('not-found'); const current = snap.data();
        const actor = operationActor(operation);
        if (!editableProject(current, actor)) throw appError('permission-denied');
        const data = validateProject({ ...current, ...input, memberIds: input.memberIds ?? current.memberIds });
        // Resume only the same pending ACL target. A stale form cannot replace it.
        const currentMembers = current.memberIds ?? [];
        const targetMembers = data.memberIds ?? currentMembers;
        const changed = Boolean(data.memberIds && JSON.stringify([...currentMembers].sort()) !== JSON.stringify([...targetMembers].sort()));
        if (current.maintenance && current.maintenance !== 'acl') throw appError('project-busy');
        if ((!current.maintenance || changed) && expected !== undefined && !sameVersion(current.updatedAt, expected)) throw appError('aborted');
        if (current.ownerId && data.memberIds && !data.memberIds.includes(current.ownerId)) throw appError('permission-denied');
        if (current.maintenance === 'acl' && !changed) return { ...current, id, actor, needsSync: true };
        const next = { ...data, ...(changed ? { maintenance: 'acl' } : {}), updatedAt: this.timestamp() }; operation?.assertActive(); tx.update(ref, next); this.audit(tx, { ...current, ...next, id }, actor, 'project', id, 'update', `Proyek ${current.name ?? id} diperbarui.`); return { ...current, ...next, id, actor, needsSync: changed };
      });
      committed = true; operation?.assertActive();
      const actor = result.actor;
      if (result.needsSync) {
        // Parent ACL changed atomically before propagation. Child Rules consult the
        // current parent: revoked users cannot read stale child ACL even after a crash.
        // Activities deliberately retain their historical snapshot (including revoked members).
        for (const col of ['tasks', 'comments']) {
          stage = `${col}-acl`; let cursor = null;
          do {
            const page = await this.scanPage(col, { user: actor, projectId: id, cursor }, operation); if (!page.items.length) break;
            for (const item of page.items) {
              operation?.assertActive(); const pRef = this.ref('projects', id);
              await this.sdk.runTransaction(this.db, async (tx) => {
                operation?.assertActive(); const pSnap = await this.readTx(tx, pRef, operation); const child = await this.readTx(tx, this.ref(col, item.id), operation); if (!child.exists()) return;
                const p = pSnap.data(); if (p.maintenance !== 'acl' || !editableProject(p, actor) || JSON.stringify([...p.memberIds].sort()) !== JSON.stringify([...result.memberIds].sort())) throw appError('project-busy');
                const patch = col === 'tasks' ? { memberIds: [...p.memberIds], ...(child.data().assigneeId && !p.memberIds.includes(child.data().assigneeId) ? { assigneeId: null } : {}), updatedAt: this.timestamp() } : { memberIds: [...p.memberIds] };
                operation?.assertActive(); tx.update(this.ref(col, item.id), patch);
              });
              completed++; progress?.({ stage, completed }); operation?.assertActive();
            }
            if (!page.hasMore) break; cursor = page.cursor;
          } while (true);
        }
        stage = 'acl-unlock'; await this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const ref = this.ref('projects', id); const snap = await this.readTx(tx, ref, operation); if (snap.data().maintenance !== 'acl' || !editableProject(snap.data(), actor) || JSON.stringify([...snap.data().memberIds].sort()) !== JSON.stringify([...result.memberIds].sort())) throw appError('project-busy'); operation?.assertActive(); tx.update(ref, { maintenance: null, updatedAt: this.timestamp() }); });
      }
      const { needsSync, actor: _actor, ...out } = result; return { ...out, ...(result.needsSync ? { maintenance: null } : {}) };
    } catch (error) { if (!committed) throw error; throw partialError(error, stage, completed, { projectId: id, maintenance: 'acl' }); }
  }
  async lockProject(id, actor, kind, operation) {
    return this.sdk.runTransaction(this.db, async (tx) => {
      operation?.assertActive(); const ref = this.ref('projects', id); const snap = await this.readTx(tx, ref, operation); if (!snap.exists()) throw appError('not-found'); const p = snap.data();
      if (kind === 'delete' ? p.ownerId !== actor.id : actor.role !== 'admin') throw appError('permission-denied');
      if (kind === 'recount' && p.maintenance === 'delete') {
        operation?.assertActive(); tx.update(ref, { maintenance: 'recount', maintenanceResume: 'delete', updatedAt: this.timestamp() });
        return { ...p, id, recountDuringDelete: true };
      }
      if (p.maintenance && p.maintenance !== kind) throw appError('project-busy');
      if (p.maintenance !== kind) { operation?.assertActive(); tx.update(ref, { maintenance: kind, updatedAt: this.timestamp() }); }
      return { ...p, id, recountDuringDelete: kind === 'recount' && p.maintenanceResume === 'delete' };
    });
  }
  async deleteProject(id, operation, options = {}) {
    const actor = operationActor(operation);
    const progress = options.onProgress ?? operation?.onProgress; let locked = false; let stage = 'lock'; let completed = 0;
    try {
      await this.lockProject(id, actor, 'delete', operation); locked = true; operation?.assertActive();
      stage = 'comments';
      // Delete each comment with its own canonical audit (2 writes, <=5 budget).
      let cursor = null;
      do { const page = await this.scanPage('comments', { user: actor, projectId: id, cursor }, operation); if (!page.items.length) break; for (const c of page.items) { await this.removeComment(c.id, actor, operation); completed++; progress?.({ stage, completed }); } if (!page.hasMore) break; cursor = page.cursor; } while (true);
      stage = 'tasks'; cursor = null;
      do { const page = await this.scanPage('tasks', { user: actor, projectId: id, cursor }, operation); if (!page.items.length) break; for (const task of page.items) { await this.deleteTaskTransaction(task.id, actor, operation, true); completed++; progress?.({ stage, completed }); } if (!page.hasMore) break; cursor = page.cursor; } while (true);
      stage = 'project-delete';
      await this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const ref = this.ref('projects', id); const snap = await this.readTx(tx, ref, operation); if (!snap.exists()) throw appError('not-found'); const p = snap.data(); if (p.ownerId !== actor.id || p.maintenance !== 'delete') throw appError('permission-denied'); if (p.taskTotal !== 0 || p.taskDone !== 0) throw appError('project-has-tasks'); operation?.assertActive(); tx.delete(ref); this.audit(tx, { ...p, id }, actor, 'project', id, 'delete', `Proyek ${p.name} dihapus.`); });
      completed++; progress?.({ stage: 'complete', completed });
    } catch (error) { if (!locked) throw error; throw partialError(error, stage, completed, { projectId: id, maintenance: 'delete' }); }
  }

  async getTask(id) { return this.document(await this.sdk.getDoc(this.ref('tasks', id))); }
  taskQuery({ user, projectId = null, pageSize: size = 150, cursor = null } = {}) { requireActor(user); if (!projectId && user.role !== 'admin') throw appError('invalid-argument', { message: 'Daftar tugas anggota harus dibatasi proyek.' }); const filters = []; if (projectId) filters.push(['projectId', '==', projectId]); if (user.role !== 'admin') filters.push(['memberIds', 'array-contains', user.id]); return this.orderedQuery('tasks', filters, [['position', 'asc'], ['createdAt', 'desc'], ['__name__', 'asc']], size, cursor); }
  async listTasks(options) {
    const n = pageSize(options.pageSize, 150); const user = requireActor(options.user);
    if (options.projectId || user.role === 'admin') return this.page(await this.sdk.getDocs(this.taskQuery({ ...options, pageSize: n })), n);
    // Nonadmin global list uses an opaque composite cursor over project-scoped pages.
    const items = []; let cursor = options.cursor; let projectCursor = cursor?.projectCursor ?? null; let activeId = cursor?.projectId ?? null; let taskCursor = cursor?.taskCursor ?? null;
    while (items.length < n) {
      if (!activeId) { const projects = await this.listProjects({ user, cursor: projectCursor, pageSize: 1 }); if (!projects.items.length) return { items, cursor: null, hasMore: false, fromCache: false, pending: false }; activeId = projects.items[0].id; projectCursor = projects.cursor; taskCursor = null; }
      const page = await this.listTasks({ user, projectId: activeId, pageSize: n - items.length, cursor: taskCursor }); items.push(...page.items);
      if (page.hasMore) taskCursor = page.cursor; else { activeId = null; taskCursor = null; }
      if (items.length >= n) return { items, cursor: { projectCursor, projectId: activeId, taskCursor }, hasMore: true, fromCache: false, pending: false };
    }
    return { items, cursor: null, hasMore: false, fromCache: false, pending: false };
  }
  watchTasks(options, next, error = () => {}) {
    const n = pageSize(options.pageSize, 150); const user = requireActor(options.user);
    if (options.projectId || user.role === 'admin') return this.sdk.onSnapshot(this.taskQuery({ ...options, pageSize: n }), { includeMetadataChanges: true }, (snap) => next(this.page(snap, n)), error);
    // Live global UI deliberately bounded to its first 24 visible projects; exports use all pages.
    let active = true; const children = new Map(); let projectMore = false;
    const emit = () => { if (!active) return; const pages = [...children.values()].map((c) => c.page).filter(Boolean); const items = pages.flatMap((p) => p.items); next({ items: items.slice(0, n), hasMore: projectMore || items.length > n || pages.some((p) => p.hasMore), cursor: null, fromCache: pages.some((p) => p.fromCache), pending: pages.some((p) => p.pending) }); };
    const off = this.watchProjects({ user }, (page) => { projectMore = page.hasMore; const ids = new Set(page.items.map((p) => p.id)); for (const [id, c] of children) if (!ids.has(id)) { c.off(); children.delete(id); } for (const p of page.items) if (!children.has(p.id)) { const child = { page: null, off: () => {} }; children.set(p.id, child); child.off = this.watchTasks({ ...options, projectId: p.id }, (value) => { child.page = value; emit(); }, error); } emit(); }, error);
    return () => { active = false; off(); for (const c of children.values()) c.off(); children.clear(); };
  }
  async saveTask({ id = null, data: input, actor, expectedUpdatedAt, seedMetadata = null, targetRef = null, completedAt: seedCompletedAt = null }, operation) {
    operation?.assertActive(); requireActor(actor); const data = validateTask(input); const taskRef = targetRef ?? (id ? this.ref('tasks', id) : this.autoRef('tasks'));
    return this.sdk.runTransaction(this.db, async (tx) => {
      operation?.assertActive(); const pRef = this.ref('projects', data.projectId); const pSnap = await this.readTx(tx, pRef, operation); if (!pSnap.exists()) throw appError('not-found'); const p = pSnap.data(); if (!projectAccess(p, actor)) throw appError('permission-denied'); writable(p); if (data.assigneeId && !p.memberIds.includes(data.assigneeId)) throw appError('permission-denied');
      let current = null;
      if (id) { const snap = await this.readTx(tx, taskRef, operation); current = snap.exists() ? snap.data() : null; if (!current) throw appError('not-found'); }
      if (current) { if (current.deleting) throw appError('task-busy'); if (current.projectId !== data.projectId) throw appError('permission-denied'); if (current.ownerId !== p.ownerId) throw appError('failed-precondition', { message: 'Pemilik tugas lama tidak cocok. Diperlukan migrasi data tepercaya.' }); if (expectedUpdatedAt !== undefined && !sameVersion(current.updatedAt, expectedUpdatedAt)) throw appError('aborted'); }
      const next = { ...data, ownerId: p.ownerId, createdBy: current?.createdBy ?? actor.id, memberIds: [...p.memberIds], completedAt: data.status === 'done' ? current?.completedAt ?? seedCompletedAt ?? this.timestamp() : null, createdAt: current?.createdAt ?? this.timestamp(), updatedAt: this.timestamp(), ...(current?.seedKey ? { seedKey: current.seedKey, seedActorId: current.seedActorId } : {}), ...seedMetadata };
      const taskTotal = (p.taskTotal ?? 0) + (current ? 0 : 1); const taskDone = (p.taskDone ?? 0) + (data.status === 'done' ? 1 : 0) - (current?.status === 'done' ? 1 : 0); if (taskDone < 0 || taskDone > taskTotal) throw appError('failed-precondition');
      operation?.assertActive(); tx.set(taskRef, next);
      if (!current || (data.status === 'done') !== (current.status === 'done')) {
        tx.update(pRef, { taskTotal, taskDone, counterTaskId: taskRef.id, updatedAt: this.timestamp() });
      }
      this.audit(tx, { ...p, id: data.projectId }, actor, 'task', taskRef.id, !current ? 'create' : current.status !== data.status ? 'move' : 'update', `Tugas ${next.title} ${current ? 'diperbarui' : 'dibuat'}.`); return { ...next, id: taskRef.id };
    });
  }
  async removeTask(id, actor, operation, options = {}) {
    operation?.assertActive(); requireActor(actor); let locked = false; let completed = 0; let stage = 'task-authorize'; const progress = options.onProgress ?? operation?.onProgress;
    try {
      const task = await this.sdk.runTransaction(this.db, async (tx) => {
        operation?.assertActive(); const ref = this.ref('tasks', id); const snap = await this.readTx(tx, ref, operation); if (!snap.exists()) throw appError('not-found'); const t = snap.data(); const pSnap = await this.readTx(tx, this.ref('projects', t.projectId), operation); const p = pSnap.exists() ? pSnap.data() : null;
        if (!p || !projectAccess(p, actor) || actor.id !== t.createdBy && actor.id !== p.ownerId) throw appError('permission-denied'); writable(p);
        operation?.assertActive(); if (!t.deleting) tx.update(ref, { deleting: true, updatedAt: this.timestamp() }); return { ...t, id };
      });
      locked = true; operation?.assertActive(); stage = 'comments';
      // Preflight every comment permission before deleting any. Task creator is not a
      // moderator of other people's comments: only their authors/project owner are.
      const comments = await allPages((cursor) => this.scanPage('comments', { user: actor, taskId: id, projectId: task.projectId, cursor }, operation), operation);
      if (actor.id !== task.ownerId && comments.some((c) => c.authorId !== actor.id)) {
        await this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const ref = this.ref('tasks', id); const snap = await this.readTx(tx, ref, operation); if (snap.exists()) { operation?.assertActive(); tx.update(ref, { deleting: false, updatedAt: this.timestamp() }); } });
        locked = false; throw appError('permission-denied', { message: 'Minta pemilik proyek menghapus tugas yang mempunyai komentar anggota lain.' });
      }
      for (const c of comments) { await this.removeComment(c.id, actor, operation); completed++; progress?.({ stage, completed }); }
      stage = 'task-delete'; await this.deleteTaskTransaction(id, actor, operation); completed++; progress?.({ stage: 'complete', completed });
    } catch (error) { if (!locked) throw error; throw partialError(error, stage, completed, { taskId: id, maintenance: 'delete' }); }
  }
  async deleteTaskTransaction(id, actor, operation, projectCascade = false) {
    return this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const ref = this.ref('tasks', id); const snap = await this.readTx(tx, ref, operation); if (!snap.exists()) return; const t = snap.data(); const pRef = this.ref('projects', t.projectId); const pSnap = await this.readTx(tx, pRef, operation); if (!pSnap.exists()) throw appError('not-found'); const p = pSnap.data(); if (actor.id !== p.ownerId && actor.id !== t.createdBy || !projectAccess(p, actor)) throw appError('permission-denied'); if (projectCascade ? p.maintenance !== 'delete' || actor.id !== p.ownerId : p.maintenance || !t.deleting) throw appError('project-busy');
      const taskTotal = p.taskTotal - 1; const taskDone = p.taskDone - (t.status === 'done' ? 1 : 0); if (taskTotal < 0 || taskDone < 0 || taskDone > taskTotal) throw appError('failed-precondition', { message: 'Counter lama tidak valid; admin perlu menghitung ulang setelah pemeliharaan.' }); operation?.assertActive(); tx.delete(ref); tx.update(pRef, { taskTotal, taskDone, counterTaskId: id, updatedAt: this.timestamp() }); this.audit(tx, { ...p, id: t.projectId }, actor, 'task', id, 'delete', `Tugas ${t.title} dihapus.`);
    });
  }

  commentQuery({ user, taskId = null, projectId = null, pageSize: size = 50, cursor = null }) { requireActor(user); if (!projectId && user.role !== 'admin') throw appError('invalid-argument'); const filters = []; if (taskId) filters.push(['taskId', '==', taskId]); if (projectId) filters.push(['projectId', '==', projectId]); if (user.role !== 'admin') filters.push(['memberIds', 'array-contains', user.id]); return this.orderedQuery('comments', filters, [['createdAt', 'asc'], ['__name__', 'asc']], size, cursor); }
  async listComments(options) { let opts = options; if (!opts.projectId && opts.taskId) { const t = await this.getTask(opts.taskId); if (!t) return { items: [], cursor: null, hasMore: false }; opts = { ...opts, projectId: t.projectId }; } const n = pageSize(opts.pageSize, 50); return this.page(await this.sdk.getDocs(this.commentQuery({ ...opts, pageSize: n })), n); }
  watchComments(options, next, error = () => {}) {
    let active = true; let off = () => {};
    const attach = (opts) => { if (!active) return; const n = pageSize(opts.pageSize, 50); off = this.sdk.onSnapshot(this.commentQuery({ ...opts, pageSize: n }), { includeMetadataChanges: true }, (snap) => { if (active) next(this.page(snap, n)); }, error); };
    if (options.projectId || !options.taskId) attach(options); else this.getTask(options.taskId).then((t) => { if (!active) return; if (!t) next({ items: [], cursor: null, hasMore: false }); else attach({ ...options, projectId: t.projectId }); }).catch((e) => { if (active) error(e); });
    return () => { active = false; off(); };
  }
  async addComment({ taskId, body }, actor, operation, { targetId = null, metadata = null } = {}) {
    operation?.assertActive(); requireActor(actor); const clean = validateComment(body); const ref = targetId ? this.ref('comments', targetId) : this.autoRef('comments');
    return this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const taskSnap = await this.readTx(tx, this.ref('tasks', taskId), operation); if (!taskSnap.exists()) throw appError('not-found'); const t = taskSnap.data(); const pSnap = await this.readTx(tx, this.ref('projects', t.projectId), operation); const p = pSnap.exists() ? pSnap.data() : null; if (!projectAccess(p, actor)) throw appError('permission-denied'); writable(p); if (t.deleting) throw appError('task-busy');
      const next = { taskId, projectId: t.projectId, authorId: actor.id, body: clean, memberIds: [...p.memberIds], createdAt: this.timestamp(), updatedAt: this.timestamp(), ...metadata }; operation?.assertActive(); tx.set(ref, next); this.audit(tx, { ...p, id: t.projectId }, actor, 'comment', ref.id, 'create', `Komentar pada ${t.title} ditambahkan.`); return { ...next, id: ref.id };
    });
  }
  async removeComment(id, actor, operation) {
    operation?.assertActive(); requireActor(actor);
    return this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const ref = this.ref('comments', id); const snap = await this.readTx(tx, ref, operation); if (!snap.exists()) throw appError('not-found'); const c = snap.data(); const pSnap = await this.readTx(tx, this.ref('projects', c.projectId), operation); const p = pSnap.exists() ? pSnap.data() : null; if (!projectAccess(p, actor) || c.authorId !== actor.id && p.ownerId !== actor.id) throw appError('permission-denied'); operation?.assertActive(); tx.delete(ref); this.audit(tx, { ...p, id: c.projectId }, actor, 'comment', id, 'delete', 'Komentar dihapus.'); });
  }
  activityQuery({ user, projectId = null, pageSize: size = 50, cursor = null }) { requireActor(user); const filters = []; if (projectId) filters.push(['projectId', '==', projectId]); if (user.role !== 'admin') filters.push(['memberIds', 'array-contains', user.id]); return this.orderedQuery('activity', filters, [['createdAt', 'desc'], ['__name__', 'asc']], size, cursor); }
  async listActivity(options) { const n = pageSize(options.pageSize, 50); return this.page(await this.sdk.getDocs(this.activityQuery({ ...options, pageSize: n })), n, normalizeActivity); }
  collectVisible(user, limits) { return collectSnapshot(this, user, limits); }
  exportVisible(user) { return exportData(this, user); }
  seedDemo(seed, actor, operation) { return importSeed(this, seed, actor, operation); }
  async seedIdentity(col, raw, actor, parentId, operation) {
    // One per-actor reservation registry makes auto-ID imports retry/concurrency safe.
    // Entries are add-only identities, not copies of mutable demo contents.
    operation?.assertActive(); const registryRef = this.ref('seedRegistry', actor.id); const registry = this.document(await this.readDoc(registryRef, operation)); const key = `${col}:${raw.id}`;
    let id = registry?.entries?.[key]; let existing = null;
    if (!id) {
      const filters = [['seedActorId', '==', actor.id], ['seedKey', '==', key]]; if (parentId && ['tasks', 'activity'].includes(col)) filters.push(['projectId', '==', parentId]);
      const match = await this.sdk.getDocs(this.orderedQuery(col, filters, [['__name__', 'asc']], 1)); operation?.assertActive();
      if (!match.empty) { id = match.docs[0].id; existing = this.document(match.docs[0]); }
      // Legacy unscoped seed keys are adopted only under an actor-owned parent.
      if (!id && ['projects', 'tasks', 'comments', 'activity'].includes(col)) {
        const prefix = { projects: 'seed_proj_', tasks: 'seed_task_', comments: 'seed_comment_', activity: 'seed_act_' }[col]; let projectId = parentId;
        if (col === 'comments') { const task = this.document(await this.readDoc(this.ref('tasks', parentId), operation)); projectId = task?.projectId; }
        let owned = col === 'projects'; if (!owned && projectId) { const p = this.document(await this.readDoc(this.ref('projects', projectId), operation)); owned = p?.ownerId === actor.id; }
        if (owned) { const scoped = col === 'projects' ? [['ownerId', '==', actor.id]] : [['projectId', '==', projectId]]; const old = await this.sdk.getDocs(this.orderedQuery(col, [...scoped, ['seedKey', '==', `${prefix}${raw.id}`]], [['__name__', 'asc']], 1)); operation?.assertActive(); if (!old.empty) { id = old.docs[0].id; existing = this.document(old.docs[0]); } }
      }
      id ??= col === 'users' ? `placeholder_${newId()}` : this.autoRef(col).id;
    }
    const candidate = id;
    if (!existing && col !== 'users') {
      const snap = await this.readDoc(this.ref(col, candidate), operation).catch(() => null);
      if (snap?.exists()) existing = this.document(snap);
    } else if (!existing && col === 'users') {
      const snap = await this.readDoc(this.ref(col, candidate), operation);
      if (snap.exists()) existing = this.document(snap);
    }
    const out = await this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const reg = await this.readTx(tx, registryRef, operation); const entries = reg.data()?.entries ?? {}; const selected = entries[key] ?? candidate; if (!entries[key]) { operation?.assertActive(); tx.set(registryRef, { actorId: actor.id, entries: { ...entries, [key]: selected }, updatedAt: this.timestamp() }); } return { id: selected, existing }; });
    if (!out.existing && out.id !== candidate) {
      const snap = await this.readDoc(this.ref(col, out.id), operation).catch(() => null);
      if (snap?.exists()) out.existing = this.document(snap);
    }
    return out;
  }
  async seedCreate(col, id, data, metadata, actor, operation) {
    operation?.assertActive();
    if (col === 'tasks') { const { completedAt, ...input } = data; return this.saveTask({ data: input, actor, targetRef: this.ref(col, id), seedMetadata: metadata, completedAt }, operation); }
    if (col === 'comments') return this.addComment(data, actor, operation, { targetId: id, metadata });
    const ref = this.ref(col, id);
    const next = { ...data, ...metadata, createdAt: this.timestamp(), ...(col !== 'activity' ? { updatedAt: this.timestamp() } : {}), ...(col === 'projects' ? { taskTotal: 0, taskDone: 0 } : {}) };
    const batch = this.sdk.writeBatch(this.db); batch.set(ref, next);
    if (col === 'users') this.audit(batch, null, actor, 'user', id, 'create', `Anggota contoh ${data.name} dibuat.`);
    if (col === 'projects') this.audit(batch, { ...next, id }, actor, 'project', id, 'create', `Proyek ${data.name} dibuat.`);
    await this.commit(batch, operation);
    return { ...next, id };
  }
  async recountProjects(actor, operation, onProgress) {
    operation?.assertActive(); if (actor?.role !== 'admin') throw appError('permission-denied'); let cursor = null; let completed = 0; let stage = 'recount-projects'; let currentId = null; let locked = false;
    try {
      do { const page = await this.scanPage('projects', { user: actor, cursor }, operation); if (!page.items.length) break;
        for (const p of page.items) {
          currentId = p.id; stage = 'recount-lock'; const lockedProject = await this.lockProject(p.id, actor, 'recount', operation); const recountDuringDelete = Boolean(lockedProject.recountDuringDelete); locked = true; stage = 'recount-tasks'; let taskCursor = null; let taskTotal = 0; let taskDone = 0;
          do { const tasks = await this.scanPage('tasks', { user: actor, projectId: p.id, cursor: taskCursor }, operation); taskTotal += tasks.items.length; taskDone += tasks.items.filter((t) => t.status === 'done').length; if (!tasks.hasMore || !tasks.items.length) break; taskCursor = tasks.cursor; } while (true);
          stage = 'recount-save'; await this.sdk.runTransaction(this.db, async (tx) => { operation?.assertActive(); const ref = this.ref('projects', p.id); const snap = await this.readTx(tx, ref, operation); const expectedState = 'recount'; if (!snap.exists() || snap.data().maintenance !== expectedState) throw appError('project-busy'); operation?.assertActive(); tx.update(ref, { taskTotal, taskDone, maintenance: recountDuringDelete ? 'delete' : null, maintenanceResume: null, updatedAt: this.timestamp() }); this.audit(tx, { ...snap.data(), id: p.id }, actor, 'project', p.id, 'update', 'Counter proyek dihitung ulang.'); });
          locked = false; completed++; onProgress?.({ stage: 'recount', completed });
        }
        if (!page.hasMore) break; cursor = page.cursor;
      } while (true);
      return true;
    } catch (error) { if (!locked && !completed) throw error; throw partialError(error, stage, completed, { projectId: currentId, maintenance: 'recount' }); }
  }
}
