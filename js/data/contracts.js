import { appError, addDays, todayISO } from '../core/utils.js';
import { validatePlaceholder, validateProject, validateTask, validateComment } from '../core/validators.js';
import { resolveColor } from './colors.js';

export const PAGE_LIMITS = Object.freeze({ projects: 24, tasks: 150, comments: 50, activity: 50, users: 60 });
export const newId = () => crypto.randomUUID().replaceAll('-', '');
export function pageSize(value, maximum) { return Math.max(1, Math.min(Number.isFinite(value) ? Math.floor(value) : maximum, maximum)); }
export function requireActor(actor) { if (!actor?.id) throw appError('unauthenticated'); return actor; }
export function projectAccess(project, actor) { return !!project && (project.memberIds?.includes(actor?.id) || actor?.role === 'admin'); }
export function editableProject(project, actor) { return !!project && (project.ownerId === actor?.id || actor?.role === 'admin'); }
export function writable(project) { if (project.maintenance) throw appError('project-busy', { maintenance: project.maintenance }); }
export function operationActor(operation) { return requireActor(operation?.actor ?? (operation?.actorId ? { id: operation.actorId } : null)); }
export function partialError(cause, stage, completed, details = {}) {
  return appError('partial-failure', { cause, stage, completed, retryable: true, message: `Sebagian operasi sudah disimpan (${stage}, ${completed}). Muat ulang dan lanjutkan operasi yang sama.`, ...details });
}
export function activityData({ projectId = null, memberIds, actorId, entity, entityId, action, summary, createdAt, ...extra }) {
  return { projectId, memberIds: [...memberIds], actorId, entity, entityId, action, summary: summary.slice(0, 500), createdAt, ...extra };
}
// Read compatibility only. Stored legacy records and their ACL snapshots are never rewritten.
export function normalizeActivity(raw) {
  if (!raw) return raw;
  const { type, message, taskId, deletedProjectId, ...rest } = raw;
  const legacy = String(type ?? '');
  const entity = raw.entity ?? (legacy.startsWith('project_') ? 'project' : legacy.startsWith('comment_') ? 'comment' : legacy.startsWith('user_') || legacy.startsWith('profile_') ? 'user' : 'task');
  const action = raw.action ?? (/completed|status_changed|moved/.test(legacy) ? 'move' : /deleted|removed/.test(legacy) ? 'delete' : /created|added/.test(legacy) ? 'create' : 'update');
  return { ...rest, projectId: raw.projectId ?? deletedProjectId ?? null, memberIds: raw.memberIds ?? [], actorId: raw.actorId ?? '', entity, entityId: raw.entityId ?? (entity === 'project' ? deletedProjectId ?? raw.projectId : entity === 'comment' ? raw.commentId ?? taskId : taskId) ?? raw.id ?? '', action, summary: raw.summary ?? message ?? '', createdAt: raw.createdAt ?? null };
}
export async function allPages(load, operation) {
  const items = []; let cursor = null;
  do { operation?.assertActive(); const page = await load(cursor); operation?.assertActive(); items.push(...page.items); if (!page.hasMore || !page.cursor || !page.items.length) break; cursor = page.cursor; } while (true);
  return items;
}
export async function collectSnapshot(adapter, user, { projects = 24, tasks = 150, activity = 10, profiles = 60 } = {}) {
  // hasMore detects overflow at the hard Rules caps, without an illegal cap+1 query.
  const specs = [[projects, 'listProjects', 24], [tasks, 'listTasks', 150], [activity, 'listActivity', 50]];
  const pages = await Promise.all(specs.map(([count, method, cap]) => adapter[method]({ user, pageSize: pageSize(count + 1, cap) })));
  const users = await adapter.profilePage({ pageSize: pageSize(profiles + 1, 60) });
  return { projects: pages[0].items.slice(0, projects), tasks: pages[1].items.slice(0, tasks), activity: pages[2].items.slice(0, activity), users: users.items.slice(0, profiles), truncated: pages.some((p, i) => p.hasMore || p.items.length > specs[i][0]) || users.hasMore || users.items.length > profiles };
}
export async function exportData(adapter, user) {
  requireActor(user);
  const projects = await allPages((cursor) => adapter.listProjects({ user, cursor }));
  const tasks = []; const comments = [];
  for (const project of projects) {
    const projectTasks = await allPages((cursor) => adapter.listTasks({ user, projectId: project.id, cursor })); tasks.push(...projectTasks);
    // Project-scoped comments include any legacy orphan comments still visible to its owner.
    comments.push(...await allPages((cursor) => adapter.listComments({ user, projectId: project.id, cursor })));
  }
  const activity = await allPages((cursor) => adapter.listActivity({ user, cursor }));
  const users = await allPages((cursor) => adapter.profilePage({ cursor }));
  return { version: 1, exportedAt: new Date().toISOString(), user: { id: user.id, role: user.role }, projects, tasks, comments, activity, users };
}

const offsetDate = (raw, field, today, fallback) => raw[`${field}_offset_days`] !== undefined ? addDays(today, raw[`${field}_offset_days`]) : raw[field] ?? fallback;
const seedKey = (collection, id) => `${collection}:${id}`;
// Both adapters run this exact fixture transformation. Identity registry is actor-scoped;
// email is deliberately NEVER an identity key. createdAt/updatedAt are write timestamps,
// not backdated input values; completedAt and local calendar dates retain fixture offsets.
export async function importSeed(adapter, seed, actor, operation) {
  requireActor(actor); if (actor.role !== 'admin') throw appError('permission-denied');
  operation?.assertActive();
  if (!seed || typeof seed !== 'object') throw appError('invalid-argument');
  const collections = ['users', 'projects', 'tasks', 'comments', 'activity'];
  for (const col of collections) if (!Array.isArray(seed[col] ?? []) || (seed[col]?.length ?? 0) > 500 || (seed[col] ?? []).some((r) => typeof r.id !== 'string' || !r.id || r.id.includes('/') || r.id.length > 100)) throw appError('invalid-argument');
  const result = { created: Object.fromEntries(collections.map((c) => [c, 0])), existing: Object.fromEntries(collections.map((c) => [c, 0])), maps: Object.fromEntries(collections.map((c) => [c, {}])) };
  const today = todayISO(adapter.clock()); const userMap = { '@currentUser': actor.id }; const projects = {}; const tasks = {};
  let stage = 'seed-identities'; let completed = 0;
  try {
    for (const col of collections) for (const raw of seed[col] ?? []) {
      operation?.assertActive(); stage = `seed-${col}`;
      const key = seedKey(col, raw.id);
      const parentId = col === 'tasks' || col === 'activity' ? result.maps.projects[raw.projectId] : col === 'comments' ? result.maps.tasks[raw.taskId] : null;
      const identity = await adapter.seedIdentity(col, raw, actor, parentId, operation); operation?.assertActive();
      result.maps[col][raw.id] = identity.id;
      const metadata = { seedKey: key, seedActorId: actor.id };
      if (identity.existing) { result.existing[col]++; if (col === 'users') userMap[raw.id] = identity.id; if (col === 'projects') projects[identity.id] = identity.existing; if (col === 'tasks') tasks[identity.id] = identity.existing; continue; }
      let data;
      if (col === 'users') {
        data = validatePlaceholder({ ...raw, avatarColor: resolveColor(raw.avatarColor, adapter.palette) });
      } else if (col === 'projects') {
        const members = (raw.memberIds ?? []).map((id) => userMap[id]).filter(Boolean);
        data = { ...validateProject({ ...raw, startDate: offsetDate(raw, 'startDate', today, today), dueDate: offsetDate(raw, 'dueDate', today, addDays(today, 14)), memberIds: [...new Set([actor.id, ...members])] }), ownerId: actor.id, code: /^NIRI-[A-Z0-9]{6}$/.test(raw.code ?? '') ? raw.code : `NIRI-${identity.id.slice(0, 6).toUpperCase()}` };
      } else if (col === 'tasks') {
        if (!parentId || !projects[parentId]) throw appError('invalid-argument', { message: `Proyek contoh untuk ${raw.id} tidak ditemukan.` });
        const p = projects[parentId];
        data = validateTask({ ...raw, projectId: parentId, assigneeId: userMap[raw.assigneeId] ?? null, dueDate: offsetDate(raw, 'dueDate', today, ''), estimateHours: raw.estimateHours ?? 0, position: raw.position ?? 0 });
        if (data.assigneeId && !p.memberIds.includes(data.assigneeId)) data.assigneeId = null;
        if (data.status === 'done' && raw.completedAt_offset_days !== undefined) { const date = adapter.clock(); date.setDate(date.getDate() + raw.completedAt_offset_days); data.completedAt = date; }
      } else if (col === 'comments') {
        if (!parentId || !tasks[parentId]) throw appError('invalid-argument', { message: `Tugas contoh untuk ${raw.id} tidak ditemukan.` });
        data = { taskId: parentId, body: validateComment(raw.body), authorId: userMap[raw.authorId] ?? actor.id };
      } else {
        const p = projects[parentId]; if (!p) throw appError('invalid-argument');
        const normalized = normalizeActivity({ ...raw, projectId: parentId, taskId: result.maps.tasks[raw.taskId] ?? null, entityId: raw.entityId ? result.maps[`${raw.entity}s`]?.[raw.entityId] : undefined });
        data = { projectId: parentId, memberIds: p.memberIds, actorId: actor.id, entity: normalized.entity, entityId: normalized.entity === 'project' ? parentId : normalized.entityId, action: normalized.action, summary: normalized.summary };
      }
      const item = await adapter.seedCreate(col, identity.id, data, metadata, actor, operation); operation?.assertActive();
      if (col === 'users') userMap[raw.id] = identity.id;
      if (col === 'projects') projects[identity.id] = item;
      if (col === 'tasks') tasks[identity.id] = item;
      result.created[col]++; completed++;
      operation?.onProgress?.({ stage, completed });
    }
    return result;
  } catch (error) { if (!completed && error.code === 'session-changed') throw error; throw partialError(error, stage, completed, { result }); }
}
