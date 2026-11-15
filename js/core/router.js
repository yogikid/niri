export function matchRoute(hash = '') {
  const path = (hash.replace(/^#/, '') || '/dashboard').split('?')[0];
  if (['/login', '/dashboard', '/projects', '/tasks', '/team', '/activity', '/settings'].includes(path)) return { page: path.slice(1), params: {} };
  const match = path.match(/^\/projects\/([^/]+)$/);
  if (match) {
    try { const id = decodeURIComponent(match[1]); if (/^[A-Za-z0-9_-]{1,128}$/.test(id)) return { page: 'project-detail', params: { id } }; } catch { /* NiRi: URL cacat masuk 404. */ }
  }
  return { page: 'not-found', params: {} };
}

export class Router {
  constructor(render, session) {
    this.render = render; this.session = session; this.cleanup = () => {}; this.version = 0; this.listening = false; this.pendingPath = null; this.onHash = () => this.refresh();
  }
  listen() { if (!this.listening) { window.addEventListener('hashchange', this.onHash); this.listening = true; } }
  start() { this.listen(); return this.refresh(); }
  async refresh() {
    this.listen();
    const version = ++this.version;
    this.cleanup(); this.cleanup = () => {};
    const state = this.session();
    let route = matchRoute(location.hash);
    if (!state.user && route.page !== 'login') {
      const target = location.hash.replace(/^#/, '');
      if (target && target !== '/login' && matchRoute(location.hash).page !== 'not-found') this.pendingPath = target;
      return this.go('/login', true);
    }
    if (state.user && route.page === 'login') {
      const next = this.pendingPath || '/dashboard'; this.pendingPath = null;
      return this.go(next, true);
    }
    // NiRi: render wajib mengembalikan disposer; abort melindungi navigasi async cepat.
    const controller = new AbortController();
    this.cleanup = () => controller.abort();
    try {
      const dispose = await this.render(route, controller.signal);
      if (version !== this.version) { dispose?.(); return; }
      this.cleanup = () => { controller.abort(); dispose?.(); };
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  }
  go(path, replace = false) {
    this.listen();
    const target = `#${path}`;
    if (location.hash === target) return this.refresh();
    if (replace) { history.replaceState(null, '', target); return this.refresh(); }
    location.hash = target;
    return Promise.resolve();
  }
  stop() { ++this.version; this.cleanup(); this.cleanup = () => {}; if (this.listening) { window.removeEventListener('hashchange', this.onHash); this.listening = false; } }
}
