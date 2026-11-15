import { validateRole, validatePlaceholder } from '../core/validators.js';
import { appError, serviceOperation } from '../core/utils.js';
import { resolveColor } from '../data/colors.js';

export class TeamService {
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

  async list(options = {}) {
    this.user();
    return this.repository.listProfiles(options);
  }

  async changeRole(uid, role, options = {}) {
    const operation = this.operation(options);
    const actor = this.user();
    if (actor.role !== 'admin') throw appError('permission-denied');
    validateRole(role);
    operation.assertActive();
    return this.repository.updateProfile(uid, { role }, actor, operation);
  }

  async createPlaceholder(input, options = {}) {
    const operation = this.operation(options);
    const actor = this.user();
    if (actor.role !== 'admin') throw appError('permission-denied');
    const data = validatePlaceholder({ ...input, avatarColor: resolveColor(input.avatarColor) });
    operation.assertActive();
    return this.repository.createPlaceholder(data, actor, operation);
  }

  async removePlaceholder(uid, options = {}) {
    const operation = this.operation(options);
    const actor = this.user();
    if (actor.role !== 'admin') throw appError('permission-denied');
    operation.assertActive();
    return this.repository.deletePlaceholder(uid, actor, operation);
  }
}
