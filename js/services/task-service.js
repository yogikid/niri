import { validateTask } from '../core/validators.js';
import { appError, serviceOperation } from '../core/utils.js';

const timestampMillis = (value) => typeof value?.toMillis === 'function' ? value.toMillis() : typeof value?.seconds === 'number' ? value.seconds * 1000 + (value.nanoseconds ?? 0) / 1000000 : new Date(value ?? 0).getTime() || 0;

export function filterTasks(items, { search = '', status = '', priority = '', assigneeId = '', sort = 'position' } = {}) {
  const text = String(search).trim().toLocaleLowerCase('id-ID');
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const result = items.filter((item) => (
    (!text || `${item.title} ${item.description ?? ''}`.toLocaleLowerCase('id-ID').includes(text))
    && (!status || item.status === status)
    && (!priority || item.priority === priority)
    && (!assigneeId || item.assigneeId === assigneeId)
  ));
  if (sort === 'dueDate') {
    result.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  } else if (sort === 'priority') {
    result.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  } else if (sort === 'position') {
    result.sort((a, b) => (a.position - b.position) || timestampMillis(b.createdAt) - timestampMillis(a.createdAt) || String(a.id ?? '').localeCompare(String(b.id ?? '')));
  }
  return result;
}

export class TaskService {
  constructor(repository, currentUser, sessionRevision = () => currentUser()?.id) {
    this.repository = repository;
    this.currentUser = currentUser;
    this.sessionRevision = sessionRevision;
  }
  user() {
    const user = this.currentUser();
    if (!user?.id) throw appError('unauthenticated');
    return user;
  }
  operation(options = {}) {
    return serviceOperation(this.currentUser, this.sessionRevision, options);
  }

  async get(id) {
    this.user();
    return this.repository.getTask(id);
  }
  list(options = {}) {
    return this.repository.listTasks({ ...options, user: this.user() });
  }
  watch(options, onData, onError) {
    return this.repository.watchTasks({ ...options, user: this.user() }, onData, onError);
  }

  canEdit(task) {
    const user = this.currentUser();
    return Boolean(user && (task.memberIds?.includes(user.id) || user.role === 'admin'));
  }
  canDelete(task) {
    const user = this.currentUser();
    return Boolean(user && (task.createdBy === user.id || task.ownerId === user.id));
  }

  async create(input, options = {}) {
    const operation = this.operation(options);
    const user = this.user();
    const project = await this.repository.getProject(input.projectId);
    operation.assertActive();
    if (!project) throw appError('not-found');
    if (!project.memberIds.includes(user.id) && user.role !== 'admin') throw appError('permission-denied');

    const validated = validateTask(input);
    if (validated.assigneeId && !project.memberIds.includes(validated.assigneeId)) {
      throw appError('ValidationError', { fields: { assigneeId: 'Penerima harus anggota proyek.' } });
    }
    operation.assertActive();
    return this.repository.saveTask({ data: validated, actor: user }, operation);
  }

  async update(id, input, options = {}) {
    const operation = this.operation(options);
    const user = this.user();
    const task = await this.repository.getTask(id);
    operation.assertActive();
    if (!task) throw appError('not-found');
    if (!this.canEdit(task)) throw appError('permission-denied');

    const project = await this.repository.getProject(task.projectId);
    operation.assertActive();
    if (!project) throw appError('not-found');

    if (input.projectId && input.projectId !== task.projectId) {
      throw appError('ValidationError', { fields: { projectId: 'Proyek tugas tidak dapat dipindahkan.' } });
    }

    const merged = { ...task, ...input, projectId: task.projectId };
    const validated = validateTask(merged);
    if (validated.assigneeId && !project.memberIds.includes(validated.assigneeId)) {
      throw appError('ValidationError', { fields: { assigneeId: 'Penerima harus anggota proyek.' } });
    }
    operation.assertActive();
    return this.repository.saveTask({ id, data: validated, actor: user, expectedUpdatedAt: input.expectedUpdatedAt ?? task.updatedAt }, operation);
  }

  async move(id, status, options = {}) {
    return this.update(id, { status }, options);
  }

  async remove(id, options = {}) {
    const operation = this.operation(options);
    const user = this.user();
    const task = await this.repository.getTask(id);
    operation.assertActive();
    if (!task) throw appError('not-found');
    if (!this.canDelete(task)) throw appError('permission-denied');
    return this.repository.removeTask(id, user, operation, options);
  }
}
