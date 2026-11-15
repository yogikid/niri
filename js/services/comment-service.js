import { validateComment } from '../core/validators.js';
import { appError, serviceOperation } from '../core/utils.js';

export class CommentService {
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

  watch(taskId, onData, onError) {
    return this.repository.watchComments({ taskId, user: this.user() }, onData, onError);
  }

  canDelete(comment, task = null) {
    const user = this.currentUser();
    if (!user) return false;
    if (comment.authorId === user.id) return true;
    if (task && task.ownerId === user.id) return true;
    return false;
  }

  async add(taskId, body, options = {}) {
    const operation = this.operation(options);
    const user = this.user();
    validateComment(body);
    const task = await this.repository.getTask(taskId);
    operation.assertActive();
    if (!task) throw appError('not-found');
    if (!task.memberIds?.includes(user.id) && user.role !== 'admin') throw appError('permission-denied');
    return this.repository.addComment({ taskId, body }, user, operation);
  }

  async remove(id, options = {}) {
    const operation = this.operation(options);
    const user = this.user();
    return this.repository.removeComment(id, user, operation);
  }
}
