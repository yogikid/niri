import { validateAuth, validateProfileName } from '../core/validators.js';
import { appError } from '../core/utils.js';

export class AuthService {
  constructor({ gateway, repository, store }) {
    this.gateway = gateway; this.repository = repository; this.store = store; this.revision = 0; this.inFlight = new Map();
  }
  start() {
    return this.gateway.observe(async (authUser) => {
      const revision = ++this.revision;
      this.store.set({ ready: false, user: null, authUser, error: null });
      if (!authUser) { this.store.set({ ready: true }); return; }
      try { await this.ensureProfile(authUser, null, revision); }
      catch (error) { if (revision === this.revision) this.store.set({ ready: true, user: null, error }); }
    }, (error) => this.store.set({ ready: true, user: null, error }));
  }
  async ensureProfile(authUser, preferredName = null, revision = this.revision) {
    const uid = authUser.uid;
    const existingPromise = this.inFlight.get(uid);
    const work = existingPromise ?? (async () => {
      const existing = await this.repository.getProfile(uid);
      if (existing) return existing;
      const registeredName = this.pendingRegistration?.email === authUser.email ? this.pendingRegistration.name : null;
      const suggested = preferredName || registeredName || authUser.displayName || authUser.email?.split('@')[0] || 'Anggota NiRi';
      const name = String(suggested).trim().slice(0, 60).padEnd(2, 'i');
      // NiRi: Auth dan Firestore bukan satu transaksi; retry tidak menimpa profil yang ada.
      return this.repository.createProfile(uid, { name, email: authUser.email ?? '', role: 'member', avatarColor: getComputedStyle(document.documentElement).getPropertyValue('--pink-primary').trim(), isPlaceholder: false });
    })();
    this.inFlight.set(uid, work);
    try {
      const profile = await work;
      if (revision === this.revision) this.store.set({ ready: true, authUser, user: profile, error: null });
      return profile;
    } finally { if (this.inFlight.get(uid) === work) this.inFlight.delete(uid); }
  }
  async login(input) {
    const data = validateAuth(input, 'login');
    return this.gateway.login(data.email, data.password, data.trusted);
  }
  async register(input) {
    const data = validateAuth(input, 'register');
    this.pendingRegistration = { email: data.email, name: data.name };
    try {
      const authUser = await this.gateway.register(data.email, data.password, data.trusted);
      if (typeof this.gateway.current === 'function' && this.gateway.current()?.uid !== authUser.uid) return null;
      return await this.ensureProfile(authUser, data.name);
    } finally { this.pendingRegistration = null; }
  }
  async resetPassword(input) { const data = validateAuth(input, 'reset'); await this.gateway.resetPassword(data.email); }
  async retryProfile(name) {
    const authUser = this.gateway.current(); if (!authUser) throw appError('unauthenticated');
    return this.ensureProfile(authUser, name ? validateProfileName(name) : null);
  }
  async logout() { await this.gateway.logout(); this.store.set({ user: null, authUser: null, error: null, ready: true }); }
}
