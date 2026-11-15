import { appError, serviceOperation } from '../core/utils.js';

export class DataService {
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

  async snapshot(options = {}) {
    return this.repository.collectVisible(this.user(), options);
  }

  async exportData() {
    return this.repository.exportVisible(this.user());
  }

  async seed(seed, options = {}) {
    const operation = this.operation(options);
    const user = this.user();
    if (user.role !== 'admin') throw appError('permission-denied');
    operation.assertActive();
    return this.repository.seedDemo(seed, user, operation);
  }

  async recount(options = {}) {
    const operation = this.operation(options);
    const user = this.user();
    if (user.role !== 'admin') throw appError('permission-denied');
    operation.assertActive();
    return this.repository.recountProjects(user, operation, options.onProgress);
  }
}
