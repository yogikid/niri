const cases = [];
let group = '';
export function describe(name, run) { group = name; run(); group = ''; }
export function it(name, run) { cases.push({ name: `${group}: ${name}`, run }); }
export function assert(condition, message = 'Pernyataan tidak terpenuhi') {
  if (!condition) throw new Error(message);
}
const equal = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected), `Diharapkan ${JSON.stringify(expected)}, diterima ${JSON.stringify(actual)}`);
async function rejects(run, code) {
  try { await run(); } catch (error) { equal(error.code, code); return; }
  throw new Error(`Seharusnya ditolak dengan ${code}`);
}

async function registerTests() {
  const { validateProject, validateAuth, ValidationError } = await import('../js/core/validators.js');
  const { parseLocalDate, todayISO, addDays, isOverdue, progress, escapeHTML, translateError, initials } = await import('../js/core/utils.js');
  const { Repository } = await import('../js/data/repository.js');
  const { LocalAdapter } = await import('../js/data/local-adapter.js');
  const { ProjectService, filterProjects } = await import('../js/services/project-service.js');
  const { matchRoute, Router } = await import('../js/core/router.js');
  const { SessionStore } = await import('../js/core/auth.js');
  const { AuthService } = await import('../js/services/auth-service.js');
  const { renderProjects } = await import('../js/pages/projects.js');
  const { renderProjectDetail } = await import('../js/pages/project-detail.js');
  const { updateConnection } = await import('../js/components/shell.js');
  const { FirestoreAdapter } = await import('../js/data/firestore-adapter.js');
  const { openProjectForm } = await import('../js/components/project-form.js');
  const input = (patch = {}) => ({ name: 'Portal Akademik', description: 'Portal mahasiswa TRPL', status: 'planning', priority: 'medium', startDate: '2026-11-01', dueDate: '2026-11-30', memberIds: ['a'], ...patch });
  const user = { id: 'a', name: 'Ayu Prameswari', email: 'ayu@example.test', role: 'member' };
  const memory = () => {
    const map = new Map();
    return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
  };
  const setup = () => {
    const storage = memory();
    const adapter = new LocalAdapter({ storage, key: 'niri-test', clock: () => new Date('2026-11-14T05:00:00Z') });
    const repository = new Repository(adapter);
    const service = new ProjectService(repository, () => user);
    return { storage, adapter, repository, service };
  };

  describe('Tanggal dan keamanan output', () => {
    it('parse tanggal-saja menggunakan kalender lokal', () => {
      const date = parseLocalDate('2026-11-14');
      equal([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()], [2026, 10, 14, 0]);
    });
    it('menolak tanggal mustahil dan tahun kabisat palsu', () => {
      equal(parseLocalDate('2026-02-29'), null);
      equal(parseLocalDate('2026-13-01'), null);
      assert(parseLocalDate('2024-02-29') instanceof Date);
    });
    it('format dan penambahan hari melewati pergantian bulan', () => {
      equal(todayISO(new Date(2026, 10, 14, 23)), '2026-11-14');
      equal(addDays('2026-12-31', 1), '2027-01-01');
    });
    it('overdue mengecualikan done dan tenggat hari ini', () => {
      assert(isOverdue({ dueDate: '2026-11-13', status: 'todo' }, '2026-11-14'));
      assert(!isOverdue({ dueDate: '2026-11-13', status: 'done' }, '2026-11-14'));
      assert(!isOverdue({ dueDate: '2026-11-14', status: 'todo' }, '2026-11-14'));
      assert(!isOverdue({ dueDate: null, status: 'todo' }, '2026-11-14'));
    });
    it('progress aman terhadap pembagian nol dan counter rusak', () => {
      equal(progress({ taskTotal: 0, taskDone: 0 }), 0);
      equal(progress({ taskTotal: 3, taskDone: 1 }), 33);
      equal(progress({ taskTotal: 1, taskDone: 4 }), 100);
    });
    it('escape seluruh karakter penyisipan HTML', () => {
      equal(escapeHTML('<img src=x onerror="x">&\''), '&lt;img src=x onerror=&quot;x&quot;&gt;&amp;&#39;');
    });
    it('inisial menerima nama kosong dan satu kata', () => {
      equal(initials('Ayu Prameswari'), 'AP'); equal(initials('Ayu'), 'A'); equal(initials(''), '?');
    });
    it('error diterjemahkan tanpa membocorkan pesan mentah', () => {
      assert(translateError({ code: 'firestore/permission-denied' }).includes('izin'));
      assert(translateError({ code: 'auth/invalid-credential' }).includes('Email atau kata sandi'));
      assert(!translateError(new Error('secret-token')).includes('secret-token'));
    });
  });
  describe('Validasi', () => {
    it('proyek valid dinormalisasi tanpa field yang disuntikkan', () => {
      const data = validateProject(input({ name: '  Portal Akademik  ', taskDone: 900, ownerId: 'attacker' }));
      equal(data.name, 'Portal Akademik'); assert(!('taskDone' in data)); assert(!('ownerId' in data));
    });
    for (const [name, patch, field] of [
      ['nama pendek', { name: 'ab' }, 'name'], ['nama panjang', { name: 'x'.repeat(81) }, 'name'],
      ['status asing', { status: 'fake' }, 'status'], ['prioritas asing', { priority: 'urgent' }, 'priority'],
      ['tenggat lebih awal', { dueDate: '2026-10-30' }, 'dueDate'], ['tanggal mustahil', { startDate: '2026-02-30' }, 'startDate'],
      ['deskripsi panjang', { description: 'x'.repeat(2001) }, 'description'], ['anggota melebihi batas', { memberIds: Array.from({ length: 21 }, (_, i) => `u${i}`) }, 'memberIds'],
    ]) {
      it(`menolak ${name}`, () => {
        try { validateProject(input(patch)); } catch (error) { assert(error instanceof ValidationError); assert(Boolean(error.fields[field])); return; }
        throw new Error('Input tidak valid justru diterima');
      });
    }
    it('register menolak password pendek dan konfirmasi berbeda', () => {
      try { validateAuth({ name: 'Ayu', email: 'ayu@example.test', password: '123', confirmPassword: '456' }, 'register'); }
      catch (error) { assert(error.fields.password); assert(error.fields.confirmPassword); return; }
      throw new Error('Password salah diterima');
    });
    it('menolak tipe field proyek yang salah sebelum koersi string', () => {
      try { validateProject(input({ name: 12345, description: { teks: 'bukan string' }, memberIds: 'a' })); }
      catch (error) { assert(error.fields.name); assert(error.fields.description); assert(error.fields.memberIds); return; }
      throw new Error('Tipe salah diterima validator');
    });
    it('login tidak memaksakan panjang password pendaftaran baru', () => {
      const data = validateAuth({ email: ' AYU@example.test ', password: 'lama' }, 'login'); equal(data.email, 'ayu@example.test');
    });
  });
  describe('Repository dan proyek', () => {
    it('adapter yang tidak lengkap ditolak', () => {
      try { new Repository({}); } catch (error) { assert(error instanceof TypeError); return; }
      throw new Error('Kontrak adapter tidak diperiksa');
    });
    it('CRUD menyimpan data dan bertahan pada instance adapter baru', async () => {
      const { storage, service } = setup();
      const project = await service.create(input());
      assert(project.id); equal(project.ownerId, 'a'); equal(project.taskTotal, 0); assert(project.code.startsWith('NIRI-'));
      const second = new Repository(new LocalAdapter({ storage, key: 'niri-test' }));
      equal((await second.getProject(project.id)).name, 'Portal Akademik');
      await service.update(project.id, input({ name: 'Portal Mahasiswa' }));
      equal((await service.get(project.id)).name, 'Portal Mahasiswa');
      await service.remove(project.id); equal(await second.getProject(project.id), null);
    });
    it('pemilik selalu ada dan anggota dideduplikasi', async () => {
      const { service } = setup(); const project = await service.create(input({ memberIds: ['b', 'b'] }));
      equal(project.memberIds, ['a', 'b']);
    });
    it('query lokal hanya memberi proyek anggota kecuali admin', async () => {
      const { service, repository } = setup(); await service.create(input());
      equal((await repository.listProjects({ user: { id: 'x', role: 'member' } })).items.length, 0);
      equal((await repository.listProjects({ user: { id: 'x', role: 'admin' } })).items.length, 1);
    });
    it('service menolak update dan hapus oleh bukan pemilik', async () => {
      const { service, repository } = setup(); const p = await service.create(input());
      const other = new ProjectService(repository, () => ({ id: 'b', role: 'member' }));
      await rejects(() => other.update(p.id, input()), 'permission-denied');
      await rejects(() => other.remove(p.id), 'permission-denied');
    });
    it('admin bukan pemilik tidak boleh menghapus', async () => {
      const { service, repository } = setup(); const p = await service.create(input());
      const admin = new ProjectService(repository, () => ({ id: 'b', role: 'admin' }));
      await rejects(() => admin.remove(p.id), 'permission-denied');
    });
    it('hapus proyek melakukan cascade delete tugas terkait', async () => {
      const { service, repository } = setup(); const p = await service.create(input());
      await repository.saveTask({ data: { projectId: p.id, title: 'Tugas anak', status: 'todo', priority: 'medium', dueDate: null, estimateHours: 1, tags: [], position: 0 }, actor: user });
      equal((await repository.getProject(p.id)).taskTotal, 1);
      await service.remove(p.id);
      equal(await repository.getProject(p.id), null);
      equal((await repository.listTasks({ user, projectId: p.id })).items.length, 0);
    });
    it('pagination memakai cursor dan tidak menduplikasi item', async () => {
      const { service, repository } = setup();
      for (let i = 0; i < 5; i++) await service.create(input({ name: `Proyek ${i}` }));
      const first = await repository.listProjects({ user, pageSize: 2 });
      const next = await repository.listProjects({ user, pageSize: 2, cursor: first.cursor });
      equal(first.items.length, 2); equal(next.items.length, 2);
      assert(!first.items.some((item) => next.items.some((other) => other.id === item.id)));
    });
    it('snapshot mengembalikan cleanup dan berhenti setelah unsubscribe', async () => {
      const { service, repository } = setup(); let calls = 0;
      const off = repository.watchProjects({ user }, () => { calls++; }, () => {});
      await Promise.resolve(); await service.create(input()); await Promise.resolve();
      assert(calls >= 2); off(); const before = calls;
      await service.create(input({ name: 'Proyek kedua' })); await Promise.resolve(); equal(calls, before);
    });
    it('hasil pembacaan tidak dapat memutasi penyimpanan', async () => {
      const { service } = setup(); const p = await service.create(input());
      p.memberIds.push('attacker'); assert(!(await service.get(p.id)).memberIds.includes('attacker'));
    });
    it('filter pencarian/status dan sort tidak mengubah sumber', () => {
      const source = [ { id: '1', name: 'Portal', code: 'NIRI-A', status: 'active', priority: 'high', dueDate: '2026-11-30', taskTotal: 2, taskDone: 1 }, { id: '2', name: 'Inventaris', code: 'NIRI-B', status: 'planning', priority: 'low', dueDate: '2026-11-20', taskTotal: 0, taskDone: 0 } ];
      equal(filterProjects(source, { search: 'PORT', status: 'active' }).map((p) => p.id), ['1']);
      equal(filterProjects(source, { sort: 'dueDate' }).map((p) => p.id), ['2', '1']);
      equal(source.map((p) => p.id), ['1', '2']);
    });
  });
  describe('Isolasi sesi penulisan', () => {
    it('update dari form akun lama tidak dijalankan sebagai akun admin baru', async () => {
      const { repository, service } = setup(); const project = await service.create(input());
      let actor = user; let release; const waiting = new Promise((resolve) => { release = resolve; });
      const originalGet = repository.getProject.bind(repository);
      repository.getProject = async (id) => { await waiting; return originalGet(id); };
      const isolated = new ProjectService(repository, () => actor);
      const pending = isolated.update(project.id, input({ name: 'Operasi sesi lama' }));
      actor = { id: 'b', role: 'admin' }; release();
      await rejects(() => pending, 'session-changed'); equal((await originalGet(project.id)).name, project.name);
    });
    it('retry transaksi memeriksa identitas setelah pembacaan SDK', async () => {
      let active = true; let writes = 0;
      const sdk = { doc: () => ({}), serverTimestamp: () => 'server', runTransaction: async (_db, run) => run({
        async get() { active = false; return { exists: () => true, data: () => ({ updatedAt: 'v1' }) }; },
        update() { writes++; },
      }) };
      const adapter = new FirestoreAdapter({}, sdk);
      const options = { actorId: 'a', assertActive() { if (!active) throw Object.assign(new Error('Sesi berubah'), { code: 'session-changed' }); } };
      await rejects(() => adapter.updateProject('p', input({ name: 'Baru' }), 'v1', options), 'session-changed'); equal(writes, 0);
    });
  });
  describe('Konflik penyimpanan', () => {
    it('menolak form edit lama agar tidak mengembalikan anggota yang dicabut', async () => {
      const { service } = setup(); const project = await service.create(input());
      const staleInput = input({ name: 'Perubahan lama', expectedUpdatedAt: project.updatedAt });
      await service.update(project.id, input({ name: 'Perubahan baru' }));
      await rejects(() => service.update(project.id, staleInput), 'aborted');
      equal((await service.get(project.id)).name, 'Perubahan baru');
    });
    it('versi timestamp null menghasilkan konflik, bukan TypeError SDK', async () => {
      const sdk = { doc: () => ({}), serverTimestamp: () => 'server', runTransaction: async (_db, run) => run({ get: async () => ({ exists: () => true, data: () => ({...input(),ownerId:'a',code:'NIRI-ABCDEF',taskTotal:0,taskDone:0,createdAt:'old', updatedAt: { isEqual(other) { return other.seconds === 10; } } }) }), update() {} }) };
      const adapter = new FirestoreAdapter({}, sdk);
      await rejects(() => adapter.updateProject('p', input({ name: 'Baru' }), null, {actorId:'a',actor:user,assertActive(){}}), 'aborted');
    });
    it('adapter Firestore membandingkan versi dan menulis di transaksi', async () => {
      const writes = []; const value = { ...input(), ownerId:'a',code:'NIRI-ABCDEF',taskTotal:0,taskDone:0,createdAt:'lama', updatedAt: 'versi-baru' };
      const sdk = {
        collection:(_db,collection)=>({collection}),
        doc: (...args) => ({collection:args.length===1?args[0].collection:args[1],id:args.length===1?'audit-1':args[2]}),
        serverTimestamp: () => 'timestamp-server',
        runTransaction: async (_db, run) => run({ get: async () => ({ exists: () => true, data: () => value }), update: (ref, data) => writes.push({ref,data,kind:'update'}),set:(ref,data)=>writes.push({ref,data,kind:'set'}) }),
      };
      const adapter = new FirestoreAdapter({}, sdk);
      const operation={actorId:'a',actor:user,assertActive(){}};
      await rejects(() => adapter.updateProject('p', input({ name: 'Usang' }), 'versi-lama',operation), 'aborted'); equal(writes.length, 0);
      await adapter.updateProject('p', input({ name: 'Baru' }), 'versi-baru',operation); equal(writes.filter(w=>w.kind==='update').length, 1); equal(writes.find(w=>w.kind==='update').data.name, 'Baru');
      assert(writes.some(w=>w.kind==='set'&&w.data.entity==='project'&&w.data.action==='update'));
    });
  });
  describe('UI proyek', () => {
    it('pesan gagal proyek tetap ada setelah profil selesai dan filter berubah', async () => {
      const root = document.createElement('div'); document.body.append(root); const abort = new AbortController();
      let fail; let releaseProfiles;
      const waiting = new Promise((resolve) => { releaseProfiles = resolve; });
      const off = renderProjects(root, { projects: { watch(_options, _next, error) { fail = error; return () => {}; } }, repository: { listProfiles: () => waiting }, user, signal: abort.signal, setConnection() {} });
      try {
        fail({ code: 'failed-precondition' }); releaseProfiles([]); await Promise.resolve(); await Promise.resolve();
        assert(root.querySelector('[data-retry]'), 'Tombol retry hilang setelah profil selesai');
        root.querySelector('#project-search').value = 'Portal'; root.querySelector('#project-search').dispatchEvent(new Event('input'));
        assert(root.querySelector('[data-retry]'), 'Tombol retry hilang setelah filter berubah');
        assert(!root.textContent.includes('Proyek pertamamu dimulai di sini'));
      } finally { abort.abort(); off(); root.remove(); }
    });
    it('banner pending pada detail tetap terlihat setelah render dan profil selesai', async () => {
      const { service, repository } = setup(); const project = await service.create(input());
      const root = document.createElement('div'); root.innerHTML = '<div id="connection-state"><i></i><span></span></div><main id="main-content"></main>'; document.body.append(root);
      const abort = new AbortController(); let emit;
      const fake = { watchOne(_id, next) { emit = next; return () => {}; }, canEdit: () => true, canDelete: () => true };
      const off = renderProjectDetail(root.querySelector('main'), { id: project.id, projects: fake, repository, user, signal: abort.signal, setConnection: (data) => updateConnection(root, data) });
      try { emit({ item: project, fromCache: true, pending: true }); await Promise.resolve(); await Promise.resolve(); assert(root.querySelector('#offline-banner')); }
      finally { abort.abort(); off(); root.remove(); }
    });
    it('banner pending tidak menggandakan elemen dan status server jujur', () => {
      const root = document.createElement('div'); root.innerHTML = '<div id="connection-state"><i></i><span></span></div><main id="main-content"></main>';
      updateConnection(root, { fromCache: true, pending: true }); updateConnection(root, { fromCache: true, pending: true });
      equal(root.querySelectorAll('#offline-banner').length, 1);
      updateConnection(root, { fromCache: false, pending: false }); equal(root.querySelectorAll('#offline-banner').length, 0);
      assert(root.querySelector('#connection-state').textContent.includes('FIREBASE'));
    });
    it('URL logo tetap mengarah ke aset aplikasi dari subfolder tests', async () => {
      const { brand } = await import('../js/components/ui.js');
      const node = document.createElement('div'); node.innerHTML = brand();
      const href = node.querySelector('use').getAttribute('href');
      equal(href, new URL('../assets/logo.svg#wordmark', location.href).href);
    });
    it('render data sebagai teks, berikan link detail dan hentikan listener', async () => {
      const { service, repository } = setup(); await service.create(input({ name: '<img src=x onerror=alert(1)>' }));
      const root = document.createElement('div'); document.body.append(root); const abort = new AbortController();
      let disposed;
      try {
        disposed = renderProjects(root, { projects: service, repository, user, signal: abort.signal, setConnection() {} });
        await Promise.resolve(); await Promise.resolve();
        assert(root.textContent.includes('<img src=x onerror=alert(1)>'));
        equal(root.querySelectorAll('img').length, 0); assert(root.querySelector('a[href^="#/projects/"]'));
        assert(repository.adapter.listeners.size > 0); disposed(); equal(repository.adapter.listeners.size, 0);
      } finally { abort.abort(); disposed?.(); root.remove(); }
    });
    it('anggota non-owner tidak melihat tombol ubah atau hapus proyek', async () => {
      const { service, repository } = setup(); const project = await service.create(input({ memberIds: ['a', 'b'] }));
      const viewer = { id: 'b', name: 'Bima', role: 'member' }; const root = document.createElement('div'); document.body.append(root); const abort = new AbortController();
      const off = renderProjectDetail(root, { id: project.id, projects: new ProjectService(repository, () => viewer), repository, user: viewer, signal: abort.signal, setConnection() {} });
      try { await Promise.resolve(); await Promise.resolve(); assert(root.textContent.includes(project.name)); assert(!root.querySelector('[data-edit]')); assert(!root.querySelector('[data-delete]')); }
      finally { abort.abort(); off(); root.remove(); }
    });
    it('form menampilkan validasi inline tanpa menutup modal', async () => {
      const { service, repository } = setup(); const abort = new AbortController();
      const dialog = await openProjectForm({ projects: service, repository, user, signal: abort.signal });
      try {
        dialog.querySelector('[name=name]').value = 'x';
        dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve(); assert(dialog.open); assert(dialog.querySelector('[data-error=name]').textContent.includes('3–80'));
      } finally { dialog.close(); abort.abort(); }
    });
  });
  describe('Navigasi dan sesi async', () => {
    it('ganti akun saat profil dimuat tidak mengembalikan akun lama', async () => {
      const { repository } = setup(); const store = new SessionStore(); let observer; let release;
      const delayed = new Promise((resolve) => { release = resolve; });
      const original = repository.getProfile.bind(repository);
      repository.getProfile = async (id) => { if (id === 'slow') await delayed; return original(id); };
      const gateway = { observe(next) { observer = next; return () => {}; } };
      const auth = new AuthService({ gateway, repository, store }); auth.start();
      const pending = observer({ uid: 'slow', email: 'slow@example.test' }); await Promise.resolve();
      await observer(null); release(); await pending; equal(store.get().user, null); equal(store.get().authUser, null);
    });
    it('register yang selesai setelah logout tidak menghidupkan sesi lama', async () => {
      const { repository } = setup(); const store = new SessionStore(); let observer; let release;
      const wait = new Promise((resolve) => { release = resolve; }); let current = null;
      const gateway = { observe(next) { observer = next; return () => {}; }, current: () => current, async register() { current = { uid: 'a', email: 'ayu@example.test' }; observer(current); await wait; return { uid: 'a', email: 'ayu@example.test' }; } };
      const auth = new AuthService({ gateway, repository, store }); auth.start();
      const pending = auth.register({ name: 'Ayu', email: 'ayu@example.test', password: 'password-aman', confirmPassword: 'password-aman' });
      await Promise.resolve(); current = null; await observer(null); release(); await pending;
      equal(store.get().user, null); equal(store.get().authUser, null);
    });
    it('listener profil lama tidak membawa nama register ke akun berbeda', async () => {
      const { repository } = setup(); const store = new SessionStore(); let observer;
      const gateway = { observe(next) { observer = next; return () => {}; }, async register() { return { uid: 'a', email: 'ayu@example.test' }; } };
      const auth = new AuthService({ gateway, repository, store }); auth.start();
      await auth.register({ name: 'Nama Pendaftaran', email: 'ayu@example.test', password: 'password-aman', confirmPassword: 'password-aman' });
      await observer(null); await observer({ uid: 'b', email: 'bima@example.test' }); equal(store.get().user.name, 'bima');
    });
  });
  describe('Sesi dan pemulihan profil', () => {
    it('store memberi state awal, update, dan cleanup', () => {
      const store = new SessionStore(); const seen = [];
      const off = store.subscribe((state) => seen.push(state.user?.id ?? null));
      store.set({ user, ready: true }); off(); store.set({ user: null }); equal(seen, [null, 'a']);
    });
    it('profil akun baru selalu member dan bukan placeholder', async () => {
      const { repository } = setup(); const store = new SessionStore();
      const service = new AuthService({ gateway: {}, repository, store });
      await service.ensureProfile({ uid: 'a', email: user.email, displayName: 'Ayu' });
      const profile = await repository.getProfile('a'); equal(profile.role, 'member'); equal(profile.isPlaceholder, false);
      equal(store.get().user.id, 'a');
    });
    it('profil yang sudah ada tidak diturunkan atau ditimpa saat login ulang', async () => {
      const { repository } = setup(); await repository.createProfile('a', { ...user, role: 'admin', isPlaceholder: false });
      const store = new SessionStore(); const service = new AuthService({ gateway: {}, repository, store });
      await service.ensureProfile({ uid: 'a', email: user.email, displayName: 'Nama Baru' }); equal(store.get().user.role, 'admin'); equal(store.get().user.name, user.name);
    });
  });
  describe('Router', () => {
    it('pencarian cepat modal membuka dan menutup dengan disposer terdaftar', async () => {
      const { openQuickSearch } = await import('../js/components/quick-search.js');
      const dialog = openQuickSearch({ projects: { list: async () => ({ items: [] }) }, tasks: { list: async () => ({ items: [] }) } });
      assert(dialog.open); dialog.close(); assert(!dialog.isConnected);
    });
    it('pindah route dan stop selalu membersihkan hasil render', async () => {
      let renders = 0; let disposals = 0;
      const router = new Router(() => { renders++; return () => { disposals++; }; }, () => ({ user }));
      router.start(); await Promise.resolve();
      await router.refresh(); router.stop(); equal(disposals, renders);
    });
    it('hasil render async yang terlambat dibuang setelah stop', async () => {
      let resolveRender; let disposed = false; let aborted = false;
      const router = new Router((_route, signal) => { signal.addEventListener('abort', () => { aborted = true; }); return new Promise((resolve) => { resolveRender = resolve; }); }, () => ({ user }));
      router.start(); router.stop(); resolveRender(() => { disposed = true; }); await Promise.resolve(); await Promise.resolve();
      assert(disposed); assert(aborted);
    });
    it('mencocokkan detail, query dan halaman tidak dikenal', () => {
      equal(matchRoute('#/projects/abc?x=1'), { page: 'project-detail', params: { id: 'abc' } });
      equal(matchRoute('#/projects'), { page: 'projects', params: {} });
      equal(matchRoute('#/tidak-ada').page, 'not-found');
      equal(matchRoute('').page, 'dashboard');
    });
    it('menolak path dengan slash ter-encode dan URL cacat', () => {
      equal(matchRoute('#/projects/a%2Fb').page, 'not-found');
      equal(matchRoute('#/projects/%ZZ').page, 'not-found');
    });
  });
}

async function run() {
  const results = document.querySelector('#test-results');
  let passed = 0;
  try { await registerTests(); }
  catch (error) {
    const line = document.createElement('li'); line.textContent = `GAGAL memuat modul: ${error.message}`; results.append(line);
    document.querySelector('#test-summary').textContent = '0 lulus — implementasi belum tersedia atau modul gagal dimuat.';
    window.__testResults = { passed: 0, failed: 1, error: error.message }; return;
  }
  const failures = [];
  for (const test of cases) {
    const line = document.createElement('li');
    try { await test.run(); passed++; line.textContent = `LULUS — ${test.name}`; line.className = 'test-pass'; }
    catch (error) { line.textContent = `GAGAL — ${test.name}: ${error.message}`; line.className = 'test-fail'; failures.push(line.textContent); }
    results.append(line);
  }
  const report = { passed, failed: cases.length - passed, total: cases.length, failures };
  window.__testResults = report;
  document.querySelector('#test-summary').textContent = `${passed}/${cases.length} lulus · ${report.failed} gagal`;
}
run();
