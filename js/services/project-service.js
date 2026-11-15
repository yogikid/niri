import { validateProject } from '../core/validators.js';
import { appError, progress, serviceOperation } from '../core/utils.js';

export function filterProjects(items, { search = '', status = '', priority = '', sort = 'newest' } = {}) {
  const text = String(search).trim().toLocaleLowerCase('id-ID');
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const result = items.filter((item) => (!text || `${item.name} ${item.code}`.toLocaleLowerCase('id-ID').includes(text)) && (!status || item.status === status) && (!priority || item.priority === priority));
  if (sort === 'dueDate') result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  else if (sort === 'priority') result.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  else if (sort === 'progress') result.sort((a, b) => progress(b) - progress(a));
  return result;
}

export class ProjectService {
  constructor(repository, currentUser, sessionRevision = () => currentUser()?.id) { this.repository = repository; this.currentUser = currentUser; this.sessionRevision = sessionRevision; }
  user() { const user = this.currentUser(); if (!user?.id) throw appError('unauthenticated'); return user; }
  operation(options = {}) { return serviceOperation(this.currentUser, this.sessionRevision, options); }
  async get(id) { this.user(); return this.repository.getProject(id); }
  async countChildren(id, options = {}) { return this.repository.countProjectChildren(id, this.user(), this.operation(options)); }
  list(options = {}) { return this.repository.listProjects({ ...options, user: this.user() }); }
  watch(options, onData, onError) { return this.repository.watchProjects({ ...options, user: this.user() }, onData, onError); }
  watchOne(id, onData, onError) { this.user(); return this.repository.watchProject(id, onData, onError); }
  canEdit(project) { const user = this.currentUser(); return Boolean(user && (project.ownerId === user.id || user.role === 'admin')); }
  canDelete(project) { return project.ownerId === this.currentUser()?.id; }
  async create(input, options = {}) {
    const operation = this.operation(options); const user = this.user();
    const data = validateProject({ ...input, memberIds: [user.id, ...(Array.isArray(input.memberIds) ? input.memberIds : [])] });
    operation.assertActive();
    return this.repository.createProject({ ...data, ownerId: user.id, taskTotal: 0, taskDone: 0 }, operation);
  }
  async update(id, input, options = {}) {
    const operation = this.operation(options); const project = await this.repository.getProject(id);
    operation.assertActive();
    if (!project) throw appError('not-found');
    if (!this.canEdit(project)) throw appError('permission-denied');
    const data = validateProject({ ...input, memberIds: [project.ownerId, ...(Array.isArray(input.memberIds) ? input.memberIds : [])] });
    return this.repository.updateProject(id, data, input.expectedUpdatedAt ?? project.updatedAt, operation, options);
  }
  async remove(id, options = {}) {
    const operation = this.operation(options); const project = await this.repository.getProject(id);
    operation.assertActive();
    if (!project) throw appError('not-found');
    if (!this.canDelete(project)) throw appError('permission-denied');
    return this.repository.deleteProject(id, operation, options);
  }
}
