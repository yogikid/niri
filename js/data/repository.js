// NiRi: semua akses data melewati kontrak ini, bukan SDK di halaman/service.
const REQUIRED = [
  'getProfile', 'createProfile', 'listProfiles', 'updateProfile', 'createPlaceholder', 'deletePlaceholder',
  'getProject', 'listProjects', 'watchProjects', 'watchProject', 'createProject', 'updateProject', 'deleteProject',
  'getTask', 'listTasks', 'watchTasks', 'saveTask', 'removeTask',
  'listComments', 'watchComments', 'addComment', 'removeComment',
  'listActivity', 'collectVisible', 'seedDemo', 'recountProjects', 'exportVisible',
];

export class Repository {
  constructor(adapter) {
    for (const method of REQUIRED) {
      if (typeof adapter?.[method] !== 'function') throw new TypeError(`Adapter harus menyediakan ${method}()`);
    }
    this.adapter = adapter;
  }
  getProfile(uid) { return this.adapter.getProfile(uid); }
  createProfile(uid, data) { return this.adapter.createProfile(uid, data); }
  listProfiles(options = {}) { return this.adapter.listProfiles(options); }
  updateProfile(uid, patch, actor, operation) { return this.adapter.updateProfile(uid, patch, actor, operation); }
  createPlaceholder(data, actor, operation) { return this.adapter.createPlaceholder(data, actor, operation); }
  deletePlaceholder(uid, actor, operation) { return this.adapter.deletePlaceholder(uid, actor, operation); }

  getProject(id) { return this.adapter.getProject(id); }
  countProjectChildren(id, user, operation) { return this.adapter.countProjectChildren?.(id, user, operation); }
  listProjects(options) { return this.adapter.listProjects(options); }
  watchProjects(options, onData, onError) { return this.adapter.watchProjects(options, onData, onError); }
  watchProject(id, onData, onError) { return this.adapter.watchProject(id, onData, onError); }
  createProject(data, operation) { return this.adapter.createProject(data, operation); }
  updateProject(id, data, expectedUpdatedAt, operation, syncOptions) { return this.adapter.updateProject(id, data, expectedUpdatedAt, operation, syncOptions); }
  deleteProject(id, operation, cascadeOptions) { return this.adapter.deleteProject(id, operation, cascadeOptions); }

  getTask(id) { return this.adapter.getTask(id); }
  listTasks(options) { return this.adapter.listTasks(options); }
  watchTasks(options, onData, onError) { return this.adapter.watchTasks(options, onData, onError); }
  saveTask(params, operation) { return this.adapter.saveTask(params, operation); }
  removeTask(id, actor, operation, cascadeOptions) { return this.adapter.removeTask(id, actor, operation, cascadeOptions); }

  listComments(options) { return this.adapter.listComments(options); }
  watchComments(options, onData, onError) { return this.adapter.watchComments(options, onData, onError); }
  addComment(data, actor, operation) { return this.adapter.addComment(data, actor, operation); }
  removeComment(id, actor, operation) { return this.adapter.removeComment(id, actor, operation); }

  listActivity(options) { return this.adapter.listActivity(options); }
  collectVisible(user, limits) { return this.adapter.collectVisible(user, limits); }
  seedDemo(seed, user, operation) { return this.adapter.seedDemo(seed, user, operation); }
  recountProjects(user, operation, onProgress) { return this.adapter.recountProjects(user, operation, onProgress); }
  exportVisible(user) { return this.adapter.exportVisible(user); }
}
