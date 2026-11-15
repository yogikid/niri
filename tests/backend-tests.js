import assert, { readText } from './test-assert.js';
import { LocalAdapter } from '../js/data/local-adapter.js';
import { Repository } from '../js/data/repository.js';
import { ProjectService } from '../js/services/project-service.js';
import { TaskService, filterTasks } from '../js/services/task-service.js';
import { CommentService } from '../js/services/comment-service.js';
import { DataService } from '../js/services/data-service.js';
import { TeamService } from '../js/services/team-service.js';
import { validateComment, validateTask } from '../js/core/validators.js';
import { registerFirebaseTests } from './firebase-contract-tests.js';

const cases = [];
const test = (name, run) => cases.push({ name, run });
const seed = JSON.parse(await readText(new URL('../data/seed.json', import.meta.url)));
const owner = { id: 'owner', name: 'Pemilik NiRi', role: 'member', email: 'owner@example.test' };
const member = { id: 'member', name: 'Anggota NiRi', role: 'member', email: 'member@example.test' };
const admin = { id: 'admin', name: 'Admin NiRi', role: 'admin', email: 'admin@example.test' };
const clock = () => new Date('2026-11-14T05:00:00Z');
const palette = { '--pink-primary': '#df6485', '--success': '#338877', '--warning': '#bb8800', '--pink-soft': '#eebbbb', '--beige-accent': '#ddccaa' };
export const projectInput = (patch = {}) => ({ name: 'Proyek Backend', description: 'Uji kontrak', status: 'active', priority: 'medium', startDate: '2026-11-01', dueDate: '2026-12-31', memberIds: ['owner', 'member'], ...patch });
export const taskInput = (projectId, patch = {}) => ({ projectId, title: 'Tugas backend', description: '', assigneeId: 'member', status: 'todo', priority: 'medium', dueDate: '2026-12-01', estimateHours: 2, tags: ['api'], position: 0, ...patch });
const memory = () => { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
async function setup() {
  const storage = memory(); const adapter = new LocalAdapter({ storage, clock, palette }); const repo = new Repository(adapter);
  let actor = owner; let revision = 1;
  const current = () => actor; const rev = () => revision;
  const projects = new ProjectService(repo, current, rev);
  const project = await projects.create(projectInput());
  return { storage, adapter, repo, project, projects, tasks: new TaskService(repo, current, rev), comments: new CommentService(repo, current, rev), data: new DataService(repo, current, rev), team: new TeamService(repo, current, rev), setActor(next) { actor = next; revision++; } };
}
const rejectCode = async (fn, code) => { try { await fn(); } catch (error) { assert.ok(error.code === code || error.name === code, `expected ${code}, got ${error.code ?? error.name}: ${error.message}`); return error; } assert.fail(`Expected rejection ${code}`); };
const canonical = (activity) => {
  for (const key of ['projectId', 'memberIds', 'actorId', 'entity', 'entityId', 'action', 'summary', 'createdAt']) assert.ok(Object.hasOwn(activity, key), `missing activity.${key}`);
  assert.ok(['project', 'task', 'comment', 'user'].includes(activity.entity));
  assert.ok(['create', 'update', 'delete', 'move'].includes(activity.action));
  assert.equal(Object.hasOwn(activity, 'type'), false); assert.equal(Object.hasOwn(activity, 'message'), false);
};

test('Project create/update/delete and profile CRUD append canonical same-operation audit', async () => {
  const c = await setup(); const initial = Object.values(c.adapter.read().activity); assert.equal(initial.length, 1); canonical(initial[0]); assert.equal(initial[0].entity, 'project');
  await c.projects.update(c.project.id, projectInput({ name: 'Nama proyek baru' }));
  await c.repo.createProfile(owner.id, { name: owner.name, email: owner.email, role: 'member', avatarColor: '#123456', isPlaceholder: false });
  await c.repo.updateProfile(owner.id, { name: 'Nama Profil Baru' }, owner);
  c.setActor(admin); const guest = await c.team.createPlaceholder({ name: 'Tamu NiRi', email: '', avatarColor: '#abcdef' }); await c.team.removePlaceholder(guest.id);
  c.setActor(owner); await c.projects.remove(c.project.id);
  const activities = Object.values(c.adapter.read().activity); activities.forEach(canonical);
  assert.equal(activities.filter((a) => a.entity === 'user').length, 4);
  assert.equal(activities.filter((a) => a.entity === 'project').length, 3);
});
test('Member task has project owner, immutable creator, move audit for every status transition', async () => {
  const c = await setup(); c.setActor(member); const task = await c.tasks.create(taskInput(c.project.id));
  assert.equal(task.ownerId, owner.id); assert.equal(task.createdBy, member.id);
  await c.tasks.move(task.id, 'in_progress'); await c.tasks.move(task.id, 'review'); await c.tasks.move(task.id, 'done');
  const completed = await c.tasks.get(task.id); assert.ok(completed.completedAt);
  await c.tasks.update(task.id, { title: 'Selesai diedit', ownerId: 'attacker', createdBy: 'attacker', memberIds: ['attacker'] });
  assert.equal((await c.tasks.get(task.id)).completedAt, completed.completedAt);
  await c.tasks.move(task.id, 'todo'); assert.equal((await c.tasks.get(task.id)).completedAt, null);
  const acts = (await c.repo.listActivity({ user: owner })).items.filter((a) => a.entity === 'task'); acts.forEach(canonical);
  assert.equal(acts.filter((a) => a.action === 'move').length, 4);
  assert.equal((await c.repo.getProject(c.project.id)).taskDone, 0);
});
test('Membership propagates child ACL but never edits audit snapshot or grants old audit to new member', async () => {
  const c = await setup(); const task = await c.tasks.create(taskInput(c.project.id)); await c.comments.add(task.id, 'Diskusi');
  const before = structuredClone(c.adapter.read().activity);
  await c.projects.update(c.project.id, projectInput({ memberIds: ['owner', 'new-member'] }));
  const state = c.adapter.read(); for (const [id, a] of Object.entries(before)) assert.deepEqual(state.activity[id], a);
  assert.equal(state.tasks[task.id].assigneeId, null);
  assert.equal((await c.repo.listTasks({ user: member })).items.length, 0);
  assert.equal((await c.repo.listComments({ taskId: task.id, user: member })).items.length, 0);
  const oldHistory = await c.repo.listActivity({ user: member }); assert.equal(oldHistory.items.length, Object.keys(before).length);
  assert.equal((await c.repo.listActivity({ user: { id: 'new-member', role: 'member' } })).items.length, 1);
});
test('Comment <=500, immutable body API, only author/projectOwner deletion (not creator/admin)', async () => {
  const c = await setup(); c.setActor(member); const task = await c.tasks.create(taskInput(c.project.id));
  c.setActor(owner); const comment = await c.comments.add(task.id, '  Diskusi pemilik  '); assert.equal(comment.body, 'Diskusi pemilik');
  c.setActor(member); assert.equal(c.comments.canDelete(comment, task), false); await rejectCode(() => c.comments.remove(comment.id), 'permission-denied');
  c.setActor(admin); assert.equal(c.comments.canDelete(comment, task), false); await rejectCode(() => c.comments.remove(comment.id), 'permission-denied');
  c.setActor(owner); await c.comments.remove(comment.id);
  const last = (await c.repo.listActivity({ user: owner })).items[0]; canonical(last); assert.equal(last.entity, 'comment'); assert.equal(last.entityId, comment.id); assert.equal(last.action, 'delete');
  assert.equal(validateComment('x'.repeat(500)).length, 500); assert.throws(() => validateComment('x'.repeat(501)), { name: 'ValidationError' });
  assert.equal(typeof c.repo.updateComment, 'undefined');
});
test('Task deletion authorizes before cascade, admin cannot delete others task, owner/creator can', async () => {
  const c = await setup(); const task = await c.tasks.create(taskInput(c.project.id)); await c.comments.add(task.id, 'Tetap ada'); const before = c.adapter.read();
  c.setActor(member); await rejectCode(() => c.tasks.remove(task.id), 'permission-denied');
  c.setActor(admin); assert.equal(c.tasks.canDelete(task), false); await rejectCode(() => c.adapter.removeTask(task.id, admin), 'permission-denied'); assert.deepEqual(c.adapter.read(), before);
  c.setActor(owner); await c.tasks.remove(task.id); const p = await c.repo.getProject(c.project.id); assert.deepEqual([p.taskTotal, p.taskDone], [0, 0]);
  assert.equal(Object.keys(c.adapter.read().comments).length, 0); const activities = Object.values(c.adapter.read().activity); activities.forEach(canonical);
  assert.ok(activities.some((a) => a.entity === 'comment' && a.action === 'delete'));
});
test('Project cascade preserves ALL prior activity and emits task/comment/project deletion audit', async () => {
  const c = await setup(); const task = await c.tasks.create(taskInput(c.project.id, { status: 'done' })); await c.comments.add(task.id, 'Hapus data bukan audit');
  const prior = c.adapter.read().activity; const seen = []; await c.projects.remove(c.project.id, { onProgress: (p) => seen.push(p) });
  const state = c.adapter.read(); assert.equal(await c.repo.getProject(c.project.id), null); assert.equal(Object.keys(state.tasks).length, 0); assert.equal(Object.keys(state.comments).length, 0);
  for (const [id, value] of Object.entries(prior)) assert.deepEqual(state.activity[id], value);
  const acts = Object.values(state.activity); acts.forEach(canonical); for (const entity of ['project', 'task', 'comment']) assert.ok(acts.some((a) => a.entity === entity && a.action === 'delete'));
  assert.ok(seen.length); assert.ok((await c.repo.listActivity({ user: member })).items.length > 0);
});
test('Legacy activity normalized on read without storage migration', async () => {
  const c = await setup(); const state = c.adapter.read(); state.activity.legacy = { projectId: c.project.id, taskId: 'task-old', memberIds: ['owner'], actorId: 'owner', type: 'task_completed', message: 'Legacy selesai', createdAt: '2020-01-01T00:00:00Z' }; c.adapter.write(state);
  const item = (await c.repo.listActivity({ user: owner })).items.find((a) => a.id === 'legacy'); canonical(item); assert.equal(item.action, 'move'); assert.equal(item.entityId, 'task-old'); assert.equal(item.summary, 'Legacy selesai'); assert.deepEqual(c.adapter.read(), state);
});
test('ACTUAL seed offsets, aliases, palette, counters, comments/activity and actor-scoped idempotency', async () => {
  const c = await setup(); c.setActor(admin); const result = await c.data.seed(seed);
  assert.deepEqual(result.created, { users: 5, projects: 4, tasks: 24, comments: 10, activity: 15 });
  const exported = await c.repo.exportVisible(admin); const tasks = exported.tasks; assert.equal(tasks.length, 24); assert.equal(exported.comments.length, 10);
  const overdue = tasks.filter((t) => t.status !== 'done' && t.dueDate < '2026-11-14'); const upcoming = tasks.filter((t) => t.status !== 'done' && t.dueDate >= '2026-11-14' && t.dueDate <= '2026-11-21'); assert.equal(overdue.length, 5); assert.equal(upcoming.length, 10);
  const state = c.adapter.read(); for (const u of Object.values(state.users)) { assert.ok(u.id.startsWith('placeholder_')); assert.match(u.avatarColor, /^#[0-9a-f]{6}$/i); }
  assert.equal(JSON.stringify(state).includes('@currentUser'), false);
  for (const p of exported.projects.filter((p) => p.seedKey)) { assert.equal(p.ownerId, admin.id); assert.equal(p.taskTotal, tasks.filter((t) => t.projectId === p.id).length); }
  const first = structuredClone(state); const repeat = await c.data.seed(seed); assert.ok(Object.values(repeat.created).every((n) => n === 0)); assert.deepEqual(c.adapter.read(), first);
  const other = { ...admin, id: 'admin2' }; const second = await c.adapter.seedDemo(seed, other); assert.equal(second.created.projects, 4); assert.equal(second.created.users, 5);
});
test('Seed preserves edits, never matches real user by email, and recovers legacy identity maps', async () => {
  const c = await setup(); await c.repo.createProfile('real-auth-user', { name: 'Bima nyata', email: seed.users[0].email, role: 'member', avatarColor: '#123456', isPlaceholder: false }); c.setActor(admin); await c.data.seed(seed);
  const p = (await c.repo.listProjects({ user: admin })).items.find((p) => p.seedKey); await c.projects.update(p.id, { ...p, name: 'Nama diedit' });
  const state = c.adapter.read(); state.seedMap = {}; c.adapter.write(state); const retry = await c.data.seed(seed); assert.equal(retry.created.projects, 0); assert.equal((await c.repo.getProject(p.id)).name, 'Nama diedit');
  assert.equal((await c.repo.getProfile('real-auth-user')).isPlaceholder, false); assert.equal(Object.values(c.adapter.read().users).filter((u) => u.isPlaceholder).length, 5);
});
test('Bounded snapshot signals truncation, full export paginates, and revoked reads use authoritative parent', async () => {
  const c = await setup(); const state = c.adapter.read();
  for (let i = 0; i < 161; i++) state.tasks[`t${i}`] = { ...taskInput(c.project.id), id: `t${i}`, ownerId: owner.id, createdBy: owner.id, memberIds: ['owner', 'member'], completedAt: null, createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z' };
  state.comments.c = { id: 'c', taskId: 't0', projectId: c.project.id, authorId: owner.id, body: 'test', memberIds: ['owner', 'member'], createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z' }; c.adapter.write(state);
  const snap = await c.data.snapshot(); assert.equal(snap.tasks.length, 150); assert.equal(snap.truncated, true);
  assert.deepEqual(await c.projects.countChildren(c.project.id), { tasks: 161, comments: 1 });
  const exp = await c.data.exportData(); assert.equal(exp.tasks.length, 161); assert.equal(exp.comments.length, 1);
  const stale = c.adapter.read(); stale.projects[c.project.id].memberIds = ['owner']; c.adapter.write(stale);
  assert.equal((await c.repo.listTasks({ user: member, projectId: c.project.id })).items.length, 0); assert.equal((await c.repo.listComments({ user: member, taskId: 't0' })).items.length, 0);
});
test('Task spec uses nullable dueDate and title length 3–120 consistently', async () => {
  const c = await setup(); const created = await c.tasks.create(taskInput(c.project.id, { dueDate: null })); assert.equal(created.dueDate, null);
  assert.equal(validateTask(taskInput(c.project.id, { dueDate: '' })).dueDate, null);
  for (const title of ['a', 'ab']) assert.throws(() => validateTask(taskInput(c.project.id, { title })), { name: 'ValidationError' });
});
test('Validation and stale versions reject malformed data without counter writes', async () => {
  const c = await setup(); for (const patch of [{ title: 123 }, { status: 'bad' }, { priority: 'urgent' }, { dueDate: '2026-02-30' }, { estimateHours: Infinity }, { tags: [123] }, { position: NaN }]) assert.throws(() => validateTask(taskInput(c.project.id, patch)), { name: 'ValidationError' });
  const task = await c.tasks.create(taskInput(c.project.id)); await c.tasks.update(task.id, { title: 'Naskah baru' }); await rejectCode(() => c.tasks.update(task.id, { title: 'Lama', expectedUpdatedAt: task.updatedAt }), 'aborted');
  await rejectCode(() => c.tasks.update(task.id, { projectId: 'another' }), 'ValidationError');
});
test('Session change and storage failure cannot partially persist local writes', async () => {
  const c = await setup(); const before = c.adapter.read(); c.adapter.storage = { getItem: c.storage.getItem, setItem() { throw new Error('full'); } }; await rejectCode(() => c.tasks.create(taskInput(c.project.id)), 'storage-unavailable'); assert.deepEqual(c.adapter.read(), before);
  c.adapter.storage = c.storage; const task = await c.tasks.create(taskInput(c.project.id)); const original = c.repo.getTask.bind(c.repo); let resume; c.repo.getTask = async (id) => { await new Promise((resolve) => { resume = resolve; }); return original(id); }; const pending = c.comments.add(task.id, 'Sesi lama'); c.setActor(admin); resume(); await rejectCode(() => pending, 'session-changed');
});
test('Admin recount repairs counters; task/comment watchers unsubscribe', async () => {
  const c = await setup(); const task = await c.tasks.create(taskInput(c.project.id, { status: 'done' })); let calls = 0; const off = c.tasks.watch({ projectId: c.project.id }, () => calls++); await Promise.resolve(); off(); const old = calls; await c.comments.add(task.id, 'Perubahan'); await Promise.resolve(); assert.equal(calls, old);
  const state = c.adapter.read(); state.projects[c.project.id].taskTotal = 99; c.adapter.write(state); await rejectCode(() => c.data.recount(), 'permission-denied'); c.setActor(admin); await c.data.recount(); assert.equal((await c.repo.getProject(c.project.id)).taskTotal, 1);
});
test('Task position sort accepts Firestore Timestamp objects without localeCompare', async () => {
  const rows = [{ id: 'old', title: 'Old', position: 0, createdAt: { seconds: 10, nanoseconds: 0 } }, { id: 'new', title: 'New', position: 0, createdAt: { seconds: 20, nanoseconds: 0 } }];
  assert.deepEqual(filterTasks(rows, { sort: 'position' }).map((t) => t.id), ['new', 'old']); assert.deepEqual(rows.map((t) => t.id), ['old', 'new']);
});
test('Legacy local seed adopts comment by its actual task, without overwriting edits', async () => {
  const c = await setup(); c.setActor(admin); await c.data.seed(seed); const state = c.adapter.read(); const raw = seed.comments[0];
  const [id, comment] = Object.entries(state.comments).find(([, item]) => item.seedKey === `comments:${raw.id}`);
  comment.seedKey = `seed_comment_${raw.id}`; delete comment.seedActorId; comment.body = 'Edited old comment'; state.seedMap = {}; c.adapter.write(state);
  const before = Object.keys(state.comments).length; const result = await c.data.seed(seed); assert.equal(result.created.comments, 0); assert.equal(Object.keys(c.adapter.read().comments).length, before); assert.equal(c.adapter.read().comments[id].body, 'Edited old comment');
});
registerFirebaseTests(test, { seed, clock, palette, owner, member, admin, projectInput, taskInput, canonical, rejectCode });

export async function runBackendTests() {
  let passed = 0; const failures = [];
  for (const { name, run } of cases) { try { await run(); passed++; console.log(`PASS ${name}`); } catch (error) { failures.push({ name, message: error.stack ?? error.message }); console.error(`FAIL ${name}: ${error.stack ?? error.message}`); } }
  const result = { passed, failed: failures.length, total: cases.length, failures }; console.log(JSON.stringify(result, null, 2));
  if (typeof document !== 'undefined') { const output = document.querySelector('#backend-results'); if (output) output.textContent = JSON.stringify(result, null, 2); window.__backendResults = result; }
  return result;
}
const result = await runBackendTests(); if (typeof process !== 'undefined' && process.versions?.node && result.failed) process.exitCode = 1;
