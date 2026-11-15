// NiRi: state aplikasi saja. Kredensial/token sepenuhnya dikelola Firebase Auth SDK.
export class SessionStore {
  constructor() { this.state = { ready: false, user: null, authUser: null, error: null }; this.listeners = new Set(); }
  get() { return this.state; }
  set(patch) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(this.state); }
  subscribe(listener) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
}
