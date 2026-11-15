import assert, { readText } from './test-assert.js';
import { FirestoreAdapter } from '../js/data/firestore-adapter.js';

// A contract fake, not a Rules emulator: honors actual query constraints and stages writes
// until commit. Rejects unbounded queries, >5 writes, and transaction reads after writes.
export function fakeFirestore(initial = {}, { afterRead, beforeCommit, retry = false } = {}) {
  const store = structuredClone(initial); const queries = []; const commits = []; let nextId = 0; let tick = 0;
  const copy = (v) => v === undefined ? undefined : structuredClone(v);
  const snapshot = (ref) => ({ id: ref.id, ref, exists: () => !!store[ref.col]?.[ref.id], data: () => copy(store[ref.col]?.[ref.id]), metadata: {} });
  const apply = (ops) => { for (const { op, ref, data } of ops) { store[ref.col] ??= {}; if (op === 'delete') delete store[ref.col][ref.id]; else if (op === 'set') store[ref.col][ref.id] = copy(data); else { assert.ok(store[ref.col][ref.id], 'update of missing doc'); Object.assign(store[ref.col][ref.id], copy(data)); } } };
  const writer = () => { const ops = []; return { ops, set(ref, data) { ops.push({ op: 'set', ref, data: copy(data) }); }, update(ref, data) { ops.push({ op: 'update', ref, data: copy(data) }); }, delete(ref) { ops.push({ op: 'delete', ref }); } }; };
  const commit = async (ops) => { assert.ok(ops.length <= 5, `batch/tx has ${ops.length} writes (max 5)`); await beforeCommit?.(ops, commits); apply(ops); commits.push(copy(ops)); };
  const sdk = {
    collection: (_db, col) => ({ col }),
    doc: (dbOrCollection, colOrId, id) => dbOrCollection?.col ? { col: dbOrCollection.col, id: colOrId ?? `auto_${String(++nextId).padStart(6, '0')}` } : { col: colOrId, id: id ?? `auto_${String(++nextId).padStart(6, '0')}` },
    documentId: () => '__name__',
    where: (field, op, value) => ({ type: 'where', field, op, value }),
    orderBy: (field, direction = 'asc') => ({ type: 'orderBy', field, direction }),
    limit: (value) => ({ type: 'limit', value }),
    startAfter: (value) => ({ type: 'startAfter', value }),
    query: (collection, ...constraints) => ({ ...collection, constraints }),
    serverTimestamp: () => `SERVER_${++tick}`,
    async getDoc(ref) { const doc = snapshot(ref); await afterRead?.(ref); return doc; },
    async getDocs(q) {
      queries.push(q); const constraints = q.constraints ?? []; const cap = constraints.find((c) => c.type === 'limit')?.value;
      const max = { projects: 24, tasks: 150, comments: 50, activity: 50, users: 60 }[q.col];
      assert.ok(Number.isInteger(cap) && cap > 0 && cap <= max, `${q.col} query missing/invalid limit: ${cap}`);
      let docs = Object.keys(store[q.col] ?? {}).map((id) => snapshot({ col: q.col, id }));
      for (const c of constraints.filter((c) => c.type === 'where')) docs = docs.filter((d) => { const value = d.data()[c.field]; if (c.op === 'array-contains') return value?.includes(c.value); if (c.op === '==') return value === c.value; throw new Error(`unsupported where ${c.op}`); });
      const orders = constraints.filter((c) => c.type === 'orderBy'); docs.sort((a, b) => { for (const o of orders) { const av = o.field === '__name__' ? a.id : a.data()[o.field]; const bv = o.field === '__name__' ? b.id : b.data()[o.field]; const comparison = av < bv ? -1 : av > bv ? 1 : 0; if (comparison) return o.direction === 'desc' ? -comparison : comparison; } return a.id.localeCompare(b.id); });
      const cursor = constraints.find((c) => c.type === 'startAfter')?.value;
      if (cursor) { const cursorId = typeof cursor === 'string' ? cursor : cursor.id; const index = docs.findIndex((d) => d.id === cursorId); if (index >= 0) docs = docs.slice(index + 1); else { const direction = orders.at(-1)?.direction ?? 'asc'; docs = docs.filter((d) => direction === 'desc' ? d.id < cursorId : d.id > cursorId); } }
      docs = docs.slice(0, cap); await afterRead?.(q);
      return { docs, size: docs.length, empty: !docs.length, metadata: {} };
    },
    async runTransaction(_db, callback) {
      if (retry) { const discarded = writer(); await callback({ ...discarded, async get(ref) { assert.equal(discarded.ops.length, 0, 'read after write'); const d = snapshot(ref); await afterRead?.(ref); return d; } }); }
      const tx = writer(); const result = await callback({ ...tx, async get(ref) { assert.equal(tx.ops.length, 0, 'read after write'); const d = snapshot(ref); await afterRead?.(ref); return d; } }); await commit(tx.ops); return result;
    },
    writeBatch() { const batch = writer(); return { ...batch, commit: () => commit(batch.ops) }; },
    async setDoc(ref, data) { await commit([{ op: 'set', ref, data }]); },
    async updateDoc(ref, data) { await commit([{ op: 'update', ref, data }]); },
    onSnapshot(q, _options, next, error) { let active = true; const work = q.constraints ? sdk.getDocs(q) : sdk.getDoc(q); work.then((s) => { if (active) next(s); }, (e) => { if (active) error?.(e); }); return () => { active = false; }; },
  };
  return { store, sdk, queries, commits };
}

export function registerFirebaseTests(test, { seed, clock, palette, owner, member, admin, projectInput, taskInput, canonical, rejectCode }) {
  const project = (extra = {}) => ({ ...projectInput(), ownerId: owner.id, taskTotal: 0, taskDone: 0, code: 'NIRI-ABCDEF', createdAt: 'old', updatedAt: 'old', ...extra });
  const task = (extra = {}) => ({ ...taskInput('p'), ownerId: owner.id, createdBy: owner.id, memberIds: ['owner', 'member'], completedAt: null, createdAt: 'old', updatedAt: 'old', ...extra });
  const operation = (actor) => ({ actorId: actor.id, actor, assertActive() {} });
  const adapterFor = (fake) => new FirestoreAdapter({}, fake.sdk, { clock, palette });
  test('Firestore task write uses authoritative owner, canonical audit and counter task witness atomically', async () => {
    const f = fakeFirestore({ projects: { p: project() } }); const a = adapterFor(f); const saved = await a.saveTask({ data: taskInput('p'), actor: member });
    assert.equal(saved.ownerId, owner.id); assert.equal(saved.createdBy, member.id); assert.equal(f.commits.length, 1);
    const ops = f.commits[0]; assert.equal(ops.length, 3); const p = f.store.projects.p; assert.equal(p.taskTotal, 1); assert.equal(p.counterTaskId, saved.id);
    canonical(Object.values(f.store.activity)[0]); assert.equal(Object.values(f.store.activity)[0].entityId, saved.id);
    await a.saveTask({ id: saved.id, data: { ...saved, status: 'review' }, actor: owner }); assert.equal(Object.values(f.store.activity).at(-1).action, 'move');
  });
  test('Firestore permission failure occurs before any comment cascade query/write', async () => {
    const f = fakeFirestore({ projects: { p: project({ taskTotal: 1 }) }, tasks: { t: task() }, comments: { c: { taskId: 't', projectId: 'p', authorId: owner.id, body: 'secret' } } }); const a = adapterFor(f);
    await rejectCode(() => a.removeTask('t', admin, operation(admin)), 'permission-denied'); assert.equal(f.commits.length, 0); assert.equal(f.queries.length, 0); assert.ok(f.store.comments.c);
  });
  test('Firestore post-await and every retry session checks prevent stale writes', async () => {
    let invalid = false; const f = fakeFirestore({ projects: { p: project() } }, { afterRead() { invalid = true; }, retry: true }); const a = adapterFor(f);
    await rejectCode(() => a.saveTask({ data: taskInput('p'), actor: owner }, { assertActive() { if (invalid) throw Object.assign(new Error('changed'), { code: 'session-changed' }); } }), 'session-changed'); assert.equal(f.commits.length, 0);
  });
  test('Firestore queries bounded and cursor-paged, nonadmin project queries include membership', async () => {
    const initial = { projects: {}, tasks: {}, comments: {}, activity: {}, users: {} };
    for (let i = 0; i < 27; i++) initial.projects[`p${String(i).padStart(2, '0')}`] = project();
    for (let i = 0; i < 159; i++) initial.tasks[`t${String(i).padStart(3, '0')}`] = task({ projectId: 'p00' });
    for (let i = 0; i < 57; i++) { initial.comments[`c${i}`] = { taskId: 't000', projectId: 'p00', memberIds: ['owner'], createdAt: 'old' }; initial.activity[`a${i}`] = { projectId: 'p00', memberIds: ['owner'], actorId: owner.id, entity: 'task', entityId: 't000', action: 'create', summary: 'test', createdAt: 'old' }; }
    for (let i = 0; i < 63; i++) initial.users[`u${i}`] = { name: 'Test user', role: 'member' };
    const f = fakeFirestore(initial); const a = adapterFor(f); const exported = await a.exportVisible(owner);
    assert.deepEqual([exported.projects.length, exported.tasks.length, exported.comments.length, exported.activity.length], [27, 159, 57, 57]);
    assert.equal(exported.users.length, 63);
    assert.ok(f.queries.some((q) => q.constraints.some((c) => c.type === 'startAfter')));
    for (const q of f.queries.filter((q) => ['projects', 'tasks', 'comments', 'activity'].includes(q.col))) assert.ok(q.constraints.some((c) => c.type === 'where' && c.field === 'memberIds' && c.value === owner.id), `missing member constraint on ${q.col}`);
  });
  test('Firestore membership sync paginates children, preserves audit, commits progress only after commit', async () => {
    const initial = { projects: { p: project({ taskTotal: 156 }) }, tasks: {}, comments: {}, activity: { historic: { projectId: 'p', memberIds: ['owner', 'member'], actorId: owner.id, type: 'task_created', taskId: 't0', message: 'history', createdAt: 'old' } } };
    for (let i = 0; i < 156; i++) initial.tasks[`t${String(i).padStart(3, '0')}`] = task();
    for (let i = 0; i < 53; i++) initial.comments[`c${String(i).padStart(3, '0')}`] = { projectId: 'p', taskId: 't000', authorId: owner.id, body: 'immutable', memberIds: ['owner', 'member'], createdAt: 'old', updatedAt: 'old' };
    const f = fakeFirestore(initial); const a = adapterFor(f); let previouslyCommitted = 0;
    await a.updateProject('p', projectInput({ memberIds: ['owner'] }), 'old', operation(owner), { onProgress(p) { assert.ok(f.commits.length >= previouslyCommitted); previouslyCommitted = f.commits.length; assert.ok(p.completed <= f.commits.flat().length); } });
    assert.deepEqual(f.store.activity.historic, initial.activity.historic); assert.ok(Object.values(f.store.tasks).every((t) => t.memberIds.length === 1 && t.assigneeId === null)); assert.ok(Object.values(f.store.comments).every((c) => c.memberIds.length === 1 && c.body === 'immutable'));
    assert.equal(f.store.projects.p.maintenance, null); assert.equal(f.queries.some((q) => q.col === 'activity'), false);
    assert.ok(f.queries.some((q) => q.col === 'tasks' && q.constraints.some((c) => c.type === 'startAfter')));
  });
  test('Firestore cascade locks, decrements each task counter, preserves audit and can resume partial failure', async () => {
    let fail = true; const f = fakeFirestore({ projects: { p: project({ taskTotal: 2, taskDone: 1 }) }, tasks: { t1: task({ status: 'done', completedAt: 'old' }), t2: task() }, comments: { c: { projectId: 'p', taskId: 't1', authorId: member.id, body: 'body', memberIds: ['owner', 'member'], createdAt: 'old', updatedAt: 'old' } }, activity: { old: { projectId: 'p', taskId: 't1', memberIds: ['owner'], type: 'task_created', message: 'old' } } }, { beforeCommit(ops) { if (fail && ops.some((o) => o.op === 'delete' && o.ref.col === 'tasks')) { fail = false; throw new Error('network dropped'); } } });
    const a = adapterFor(f); const counts = await a.countProjectChildren('p', owner, operation(owner)); assert.deepEqual(counts, { tasks: 2, comments: 1 });
    const old = structuredClone(f.store.activity.old); const error = await rejectCode(() => a.deleteProject('p', operation(owner)), 'partial-failure');
    assert.equal(f.store.projects.p.maintenance, 'delete'); assert.equal(f.store.projects.p.taskTotal, 2); assert.ok(f.store.tasks.t1); assert.ok(error.stage); assert.ok(Number.isInteger(error.completed)); assert.equal(error.retryable, true);
    await a.deleteProject('p', operation(owner)); assert.equal(f.store.projects.p, undefined); assert.equal(Object.keys(f.store.tasks).length, 0); assert.equal(Object.keys(f.store.comments).length, 0); assert.deepEqual(f.store.activity.old, old);
    for (const ops of f.commits) for (const op of ops.filter((o) => o.op === 'delete' && o.ref.col === 'tasks')) assert.ok(ops.some((o) => o.ref.col === 'projects' && o.op === 'update' && o.data.counterTaskId === op.ref.id));
    assert.ok(Object.values(f.store.activity).some((a) => a.entity === 'project' && a.action === 'delete'));
  });
  test('Firestore seed consumes ACTUAL fixture; batches bounded, actor-scoped limits, no aliases, retries preserve edits', async () => {
    const f = fakeFirestore({ users: { admin: { name: admin.name, role: 'admin', isPlaceholder: false } } }); const a = adapterFor(f); const result = await a.seedDemo(seed, admin, operation(admin));
    assert.deepEqual(result.created, { users: 5, projects: 4, tasks: 24, comments: 10, activity: 15 });
    assert.equal(Object.keys(f.store.comments).length, 10); assert.equal(Object.values(f.store.activity).filter((a) => a.seedKey?.includes('activity')).length, 15);
    assert.equal(JSON.stringify(f.store).includes('@currentUser'), false);
    const seededTasks = Object.values(f.store.tasks); assert.equal(seededTasks.filter((t) => t.status !== 'done' && t.dueDate < '2026-11-14').length, 5); assert.equal(seededTasks.filter((t) => t.status !== 'done' && t.dueDate >= '2026-11-14' && t.dueDate <= '2026-11-21').length, 10);
    assert.ok(Object.keys(f.store.users).filter((id) => id !== 'admin').every((id) => id.startsWith('placeholder_')));
    const p = Object.values(f.store.projects)[0]; p.name = 'Edited seed project'; const before = structuredClone(f.store); const repeat = await a.seedDemo(seed, admin, operation(admin)); assert.ok(Object.values(repeat.created).every((n) => n === 0)); assert.deepEqual(f.store, before);
    for (const q of f.queries.filter((q) => q.constraints.some((c) => c.field === 'seedKey' && c.type === 'where'))) assert.ok(q.constraints.some((c) => (c.field === 'seedActorId' || c.field === 'ownerId') && c.value === admin.id || c.field === 'projectId'));
  });
  test('Firestore profile CRUD and comment delete include canonical audit in the same commit', async () => {
    const f = fakeFirestore({ projects: { p: project() }, tasks: { t: task() } }); const a = adapterFor(f);
    await a.createProfile(owner.id, { name: owner.name, email: owner.email, role: 'member', isPlaceholder: false, avatarColor: '#123456' }); await a.updateProfile(owner.id, { name: 'New profile' }, owner, operation(owner)); const ph = await a.createPlaceholder({ name: 'Tamu NiRi' }, admin, operation(admin)); await a.deletePlaceholder(ph.id, admin, operation(admin));
    const c = await a.addComment({ taskId: 't', body: 'Body' }, member, operation(member)); await rejectCode(() => a.removeComment(c.id, admin, operation(admin)), 'permission-denied'); await a.removeComment(c.id, owner, operation(owner));
    for (const ops of f.commits.filter((ops) => ops.some((o) => ['users', 'comments'].includes(o.ref.col)))) { const audits = ops.filter((o) => o.ref.col === 'activity'); assert.ok(audits.length); audits.forEach((o) => canonical(o.data)); }
  });
  test('Firestore recount scans complete bounded pages under maintenance lock', async () => {
    const initial = { projects: {}, tasks: {} }; for (let i = 0; i < 26; i++) initial.projects[`p${String(i).padStart(2, '0')}`] = project({ taskTotal: 999 }); for (let i = 0; i < 155; i++) initial.tasks[`t${String(i).padStart(3, '0')}`] = task({ projectId: 'p00', status: i < 20 ? 'done' : 'todo' });
    const f = fakeFirestore(initial); const a = adapterFor(f); await a.recountProjects(admin, operation(admin)); assert.equal(f.store.projects.p00.taskTotal, 155); assert.equal(f.store.projects.p00.taskDone, 20); assert.equal(f.store.projects.p25.taskTotal, 0); assert.ok(Object.values(f.store.projects).every((p) => p.maintenance === null));
  });
  test('ACL retry may use a new versioned target after partial propagation failure', async () => {
    let fail = true;
    const f = fakeFirestore({ projects: { p: project({ taskTotal: 1 }) }, tasks: { t: task() } }, { beforeCommit(ops) { if (fail && ops.some((op) => op.op === 'update' && op.ref.col === 'tasks')) { fail = false; throw new Error('network dropped'); } } });
    const a = adapterFor(f); await rejectCode(() => a.updateProject('p', projectInput({ memberIds: ['owner'] }), 'old', operation(owner)), 'partial-failure');
    await a.updateProject('p', projectInput({ memberIds: ['owner', 'new-member'] }), f.store.projects.p.updatedAt, operation(owner));
    assert.equal(f.store.projects.p.maintenance, null); assert.deepEqual(f.store.tasks.t.memberIds, ['owner', 'new-member']); assert.equal(f.store.tasks.t.assigneeId, null);
  });
  test('Admin recount recovers drift during delete maintenance and keeps deletion resumable', async () => {
    const f = fakeFirestore({ projects: { p: project({ taskTotal: 9, taskDone: 4, maintenance: 'delete' }) }, tasks: { t: task({ deleting: true }) } }); const a = adapterFor(f);
    await a.recountProjects(admin, operation(admin)); assert.equal(f.store.projects.p.taskTotal, 1); assert.equal(f.store.projects.p.taskDone, 0); assert.equal(f.store.projects.p.maintenance, 'delete');
    await a.deleteProject('p', operation(owner)); assert.equal(f.store.projects.p, undefined);
  });
  test('Rules contract guards immutable audit/counters/parent ACL/comment boundary and indexes JSON loads', async () => {
    const rules = await readText(new URL('../firestore.rules', import.meta.url)); const indexes = JSON.parse(await readText(new URL('../firestore.indexes.json', import.meta.url)));
    assert.match(rules, /counterTaskId/); assert.match(rules, /getAfter\(/); assert.match(rules, /maintenance/); assert.match(rules, /data\.body\.size\(\) <= 500/);
    const activityRules = rules.slice(rules.indexOf('match /activity/')); assert.match(activityRules, /allow update, delete: if false/); assert.match(rules, /entityId/);
    assert.ok(indexes.indexes.some((i) => i.fields.some((f) => f.fieldPath === 'seedActorId')));
    const hasIndex = (col, fields) => indexes.indexes.some((i) => i.collectionGroup === col && fields.every((name) => i.fields.some((f) => f.fieldPath === name)));
    for (const [col, fields] of [['tasks', ['position', 'createdAt']], ['tasks', ['projectId', 'position', 'createdAt']], ['comments', ['taskId', 'createdAt']], ['comments', ['projectId', 'taskId', 'memberIds', '__name__']], ['users', ['seedActorId', 'seedKey', '__name__']]]) assert.ok(hasIndex(col, fields), `missing index ${col}: ${fields}`);
    assert.match(rules, /return admin\(\) \|\| \(member\(data\) && member\(get\(projectPath/);
    assert.match(rules, /after\.get\('counterTaskId', null\) == taskId && after\.updatedAt == request\.time/);
    assert.match(rules, /get\(taskPath\(id\)\)\.data\.projectId == projectId/);
    assert.match(rules, /getAfter\(taskPath\(id\)\)\.data\.updatedAt == request\.time/);
    assert.match(rules, /exists\(entityPath\(data\)\) && !existsAfter\(entityPath\(data\)\)/);
    assert.match(rules, /function sameOperation/);
    assert.equal(/\.data\.maintenance\s*==/.test(rules), false);
  });
}
