// NiRi: runner mandiri, tanpa DOM, Firebase, atau paket tambahan.
// Jalankan: node --experimental-default-type=module tests/stats-tests.js

function assert(condition, message = 'Pernyataan tidak terpenuhi.') {
  if (!condition) throw new Error(message);
}
function equal(actual, expected) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `Diharapkan ${JSON.stringify(expected)}, diterima ${JSON.stringify(actual)}.`);
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
async function optionalModule(url) {
  try { return await import(url.href); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}
async function readSeed() {
  const url = new URL('../data/seed.json', import.meta.url);
  if (globalThis.process?.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    try { return JSON.parse(await readFile(url, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const response = await fetch(url);
  return response.ok ? response.json() : null;
}
function fixture() {
  return {
    projects: [
      { id: 'p1', name: 'Portal Akademik', status: 'active', taskDone: 999, taskTotal: 999 },
      { id: 'p2', name: 'Katalog UMKM', status: 'planning', taskDone: 500, taskTotal: 500 },
      { id: 'p3', name: 'Arsip Pameran', status: 'completed', taskDone: 3, taskTotal: 3 },
    ],
    users: [{ id: 'u1', name: 'Ayu' }, { id: 'u2', name: 'Bima' }, { id: 'u3', name: 'Citra' }],
    tasks: [
      { id: 't1', projectId: 'p1', title: 'Menyusun modul', status: 'todo', priority: 'high', dueDate: '2026-11-13', assigneeId: 'u1' },
      { id: 't2', projectId: 'p1', title: 'Uji integrasi', status: 'in_progress', priority: 'critical', dueDate: '2026-11-14', assigneeId: 'u1' },
      { id: 't3', projectId: 'p1', title: 'Review antarmuka', status: 'review', priority: 'medium', dueDate: '2026-11-21', assigneeId: 'u2' },
      { id: 't4', projectId: 'p1', title: 'Diagram alur', status: 'done', priority: 'low', dueDate: '2026-11-10', assigneeId: 'u1' },
      { id: 't5', projectId: 'p2', title: 'Desain katalog', status: 'in_progress', priority: 'high', dueDate: '2026-11-22', assigneeId: '' },
      { id: 't6', projectId: 'p2', title: 'Audit akses', status: 'todo', priority: 'medium', dueDate: '2026-11-21', assigneeId: 'u2' },
      { id: 't7', projectId: 'p2', title: 'Dokumen peluncuran', status: 'done', priority: 'low', dueDate: '2026-11-12', assigneeId: null },
      { id: 't8', projectId: 'p2', title: 'Tinjau kontrak', status: 'review', priority: 'critical', dueDate: '2026-11-12', assigneeId: 'u-missing' },
      { id: 't9', projectId: 'p2', title: 'Perbaiki label', status: 'todo', priority: 'low', dueDate: '2026-02-30', assigneeId: null },
      { id: 't10', projectId: 'p2', title: 'Diskusi tim', status: 'todo', priority: 'medium', dueDate: null, assigneeId: 'u1' },
    ],
    activity: [],
  };
}
function aria(svg) {
  const match = svg.match(/^<svg\b[^>]*\baria-label="([^"]*)"/);
  assert(match, 'SVG harus memiliki label aksesibel pada elemen akar.');
  return match[1];
}
function safeSVG(svg) {
  assert(svg.startsWith('<svg '), 'Grafik harus berupa SVG mandiri.');
  assert(svg.includes('role="img"') && svg.includes('viewBox='), 'SVG harus aksesibel dan responsif.');
  assert(!/NaN|Infinity|undefined/.test(svg), 'Geometri grafik tidak boleh rusak.');
  assert(!/<script|<img|<iframe|javascript:/i.test(svg), 'Label tidak boleh menyisipkan elemen aktif.');
  assert(!/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/i.test(svg), 'Warna hanya boleh berasal dari token CSS.');
  aria(svg);
}

export async function runStatsTests({ report = () => {} } = {}) {
  const stats = await optionalModule(new URL('../js/services/stats-service.js', import.meta.url));
  const charts = await optionalModule(new URL('../js/components/charts.js', import.meta.url));
  const seed = await readSeed();
  const cases = [];
  const test = (name, run) => cases.push({ name, run });
  const build = (...args) => {
    assert(typeof stats.buildStats === 'function', 'buildStats belum diimplementasikan.');
    return stats.buildStats(...args);
  };
  const chart = (name, ...args) => {
    assert(typeof charts[name] === 'function', `${name} belum diimplementasikan.`);
    return charts[name](...args);
  };
  const requireSeed = () => { assert(seed && typeof seed === 'object', 'Seed relatif belum tersedia.'); return seed; };

  test('Statistik: sumber kosong menghasilkan nol, bukan NaN', () => {
    equal(build({}, '2026-11-14'), {
      kpis: { activeProjects: 0, inProgressTasks: 0, overdueTasks: 0, completionRate: 0 },
      statusCounts: { todo: 0, in_progress: 0, review: 0, done: 0 },
      priorityCounts: { low: 0, medium: 0, high: 0, critical: 0 },
      workload: [], projectProgress: [], upcoming: [],
      attention: { overdue: [], emptyProjects: [], unassigned: [] }, recentActivity: [],
    });
  });
  test('Statistik: facade statis menerima tanggal eksplisit', () => {
    assert(typeof stats.StatsService?.summary === 'function', 'StatsService.summary belum diimplementasikan.');
    equal(stats.StatsService.summary(fixture(), { today: '2026-11-14' }).kpis,
      { activeProjects: 1, inProgressTasks: 2, overdueTasks: 2, completionRate: 20 });
  });
  test('Statistik: KPI memakai tugas aktual, bukan counter proyek tersimpan', () => {
    equal(build(fixture(), '2026-11-14').kpis,
      { activeProjects: 1, inProgressTasks: 2, overdueTasks: 2, completionRate: 20 });
  });
  test('Statistik: seluruh status dan prioritas dihitung terpisah', () => {
    const result = build(fixture(), '2026-11-14');
    equal(result.statusCounts, { todo: 4, in_progress: 2, review: 2, done: 2 });
    equal(result.priorityCounts, { low: 3, medium: 3, high: 2, critical: 2 });
  });
  test('Statistik: terlambat mengecualikan selesai, hari ini, dan tanggal mustahil', () => {
    equal(build(fixture(), '2026-11-14').attention.overdue.map((task) => task.id), ['t8', 't1']);
  });
  test('Statistik: tenggat mendatang mencakup hari ini sampai hari ketujuh secara inklusif', () => {
    equal(build(fixture(), '2026-11-14').upcoming.map((task) => task.id), ['t2', 't3', 't6']);
  });
  test('Statistik: jendela tujuh hari melewati pergantian tahun tanpa UTC menggeser tanggal', () => {
    const tasks = [
      { id: 'hari-kedelapan', dueDate: '2027-01-06', status: 'todo' },
      { id: 'hari-ketujuh', dueDate: '2027-01-05', status: 'review' },
      { id: 'hari-ini', dueDate: '2026-12-29', status: 'in_progress' },
      { id: 'kemarin', dueDate: '2026-12-28', status: 'todo' },
      { id: 'selesai', dueDate: '2026-12-30', status: 'done' },
    ];
    equal(build({ tasks }, '2026-12-29').upcoming.map((task) => task.id), ['hari-ini', 'hari-ketujuh']);
  });
  test('Statistik: beban kerja mencakup anggota nol tugas dan ID yang profilnya belum dimuat', () => {
    equal(build(fixture(), '2026-11-14').workload, [
      { userId: 'u1', name: 'Ayu', active: 3, overdue: 1 },
      { userId: 'u2', name: 'Bima', active: 2, overdue: 0 },
      { userId: 'u-missing', name: 'Anggota tidak tersedia', active: 1, overdue: 1 },
      { userId: 'u3', name: 'Citra', active: 0, overdue: 0 },
    ]);
  });
  test('Statistik: progres proyek dihitung ulang dari tugas yang dimuat dan pembagi nol aman', () => {
    equal(build(fixture(), '2026-11-14').projectProgress, [
      { id: 'p1', name: 'Portal Akademik', done: 1, total: 4, percentage: 25 },
      { id: 'p2', name: 'Katalog UMKM', done: 1, total: 6, percentage: 17 },
      { id: 'p3', name: 'Arsip Pameran', done: 0, total: 0, percentage: 0 },
    ]);
  });
  test('Statistik: perhatian hanya menampilkan tugas belum selesai tanpa penanggung jawab', () => {
    const result = build(fixture(), '2026-11-14');
    equal(result.attention.unassigned.map((task) => task.id), ['t5', 't9']);
    equal(result.attention.emptyProjects.map((project) => project.id), ['p3']);
  });
  test('Statistik: kalkulasi berikutnya tidak memakai cache turunan dari kalkulasi lama', () => {
    const data = fixture();
    equal(build(data, '2026-11-14').kpis.completionRate, 20);
    data.tasks[0].status = 'done';
    equal(build(data, '2026-11-14').kpis.completionRate, 30);
    equal(build(data, '2026-11-14').kpis.overdueTasks, 1);
  });
  test('Statistik: input beku tidak dimutasi oleh pengurutan atau penambahan field', () => {
    const data = freeze(fixture()); const before = JSON.stringify(data);
    build(data, '2026-11-14'); equal(JSON.stringify(data), before);
  });
  test('Statistik: tanggal acuan tidak valid ditolak secara eksplisit', () => {
    try { build({}, '2026-02-30'); }
    catch (error) { assert(error instanceof RangeError, 'Tanggal salah harus menghasilkan RangeError.'); return; }
    throw new Error('Tanggal salah justru diterima.');
  });
  test('Statistik: kunci status/prioritas asing tidak mengubah bentuk hasil', () => {
    const result = build({ tasks: [{ status: '__proto__', priority: 'constructor' }, { status: 'done', priority: 'low' }] }, '2026-11-14');
    equal(result.statusCounts, { todo: 0, in_progress: 0, review: 0, done: 1 });
    equal(result.priorityCounts, { low: 1, medium: 0, high: 0, critical: 0 });
    equal(result.kpis.completionRate, 50);
  });
  test('Statistik: sepuluh aktivitas terbaru mendukung ISO, Date, dan Timestamp Firestore', () => {
    const activity = Array.from({ length: 9 }, (_, index) => ({ id: `a${index + 1}`, createdAt: `2026-11-${String(index + 1).padStart(2, '0')}T00:00:00Z` }));
    activity.push(
      { id: 'a10', createdAt: { seconds: Date.UTC(2026, 10, 10) / 1000, nanoseconds: 0 } },
      { id: 'a11', createdAt: new Date('2026-11-11T00:00:00Z') },
      { id: 'a12', createdAt: { toMillis: () => Date.UTC(2026, 10, 12) } },
      { id: 'tertunda', createdAt: null }, { id: 'rusak', createdAt: 'bukan tanggal' },
    );
    freeze(activity);
    equal(build({ activity }, '2026-11-14').recentActivity.map((item) => item.id), ['a12', 'a11', 'a10', 'a9', 'a8', 'a7', 'a6', 'a5', 'a4', 'a3']);
  });
  test('Statistik: koleksi null ditangani seperti koleksi kosong', () => {
    const result = build({ projects: null, tasks: null, users: null, activity: null }, '2026-11-14');
    equal(result.kpis, { activeProjects: 0, inProgressTasks: 0, overdueTasks: 0, completionRate: 0 });
  });

  test('Donat: segmen mengikuti proporsi angka dan label numerik tersedia', () => {
    const svg = chart('donutChart', { todo: 1, done: 3 }); safeSVG(svg);
    assert(svg.includes('stroke-dasharray="25 75"') && svg.includes('stroke-dasharray="75 25"'), 'Segmen harus mencerminkan 25% dan 75%.');
    assert(aria(svg).includes('Belum dikerjakan: 1 tugas') && aria(svg).includes('Selesai: 3 tugas'));
    assert(aria(svg).includes('Total: 4 tugas'));
  });
  test('Donat: label berbahaya di-escape pada teks, judul, dan atribut', () => {
    const svg = chart('donutChart', { todo: 2 }, { todo: '\"><script>alert(1)</script>&' }); safeSVG(svg);
    assert(svg.includes('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;'));
  });
  test('Donat: angka negatif/tidak berhingga/teks berbahaya menjadi nol', () => {
    const svg = chart('donutChart', { a: -1, b: Infinity, c: NaN, d: '\"/><script>x</script>', e: '3' }, { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E' }); safeSVG(svg);
    assert(aria(svg).includes('A: 0 tugas') && aria(svg).includes('D: 0 tugas') && aria(svg).includes('E: 3 tugas'));
    assert(aria(svg).includes('Total: 3 tugas'));
  });
  test('Batang: hitungan/label array didukung dan nilai nol tetap dijelaskan', () => {
    const svg = chart('barChart', [0, 3, 6], ['Rendah', 'Sedang', 'Tinggi']); safeSVG(svg);
    assert(aria(svg).includes('Rendah: 0 tugas') && aria(svg).includes('Sedang: 3 tugas') && aria(svg).includes('Tinggi: 6 tugas'));
    assert(svg.includes('var(--pink-primary)'));
  });
  test('Batang: nama kategori tidak dapat menyisipkan HTML', () => {
    const svg = chart('barChart', { high: 3 }, { high: '<img src=x onerror="x">' }); safeSVG(svg);
    assert(svg.includes('&lt;img src=x onerror=&quot;x&quot;&gt;'));
  });
  test('Beban kerja: aktif dan terlambat dijelaskan dengan angka tanpa menghitung ganda', () => {
    const svg = chart('workloadChart', [{ userId: 'u1', name: 'Ayu', active: 5, overdue: 2 }, { userId: 'u2', name: 'Bima', active: 1, overdue: 99 }]); safeSVG(svg);
    assert(aria(svg).includes('Ayu: 5 tugas aktif, 2 terlambat'));
    assert(aria(svg).includes('Bima: 1 tugas aktif, 1 terlambat'), 'Terlambat tidak dapat melebihi jumlah aktif.');
    assert(svg.includes('var(--danger)') && svg.includes('var(--pink-primary)'));
  });
  test('Beban kerja: nama anggota selalu di-escape dan sumber beku tidak berubah', () => {
    const rows = freeze([{ userId: 'u', name: '<script>x</script>', active: 2, overdue: 1 }]);
    const svg = chart('workloadChart', rows); safeSVG(svg); assert(svg.includes('&lt;script&gt;x&lt;/script&gt;'));
  });
  test('Progres: persentase diturunkan dari jumlah selesai/total dan dibatasi dengan aman', () => {
    const svg = chart('projectProgressChart', [
      { id: 'p1', name: 'Portal', done: 2, total: 3, percentage: 99 },
      { id: 'p2', name: 'Katalog', done: 99, total: 2 },
      { id: 'p3', name: 'Kosong', done: 1, total: 0 },
    ]); safeSVG(svg);
    assert(aria(svg).includes('Portal: 67% (2 dari 3 tugas)'));
    assert(aria(svg).includes('Katalog: 100% (2 dari 2 tugas)'));
    assert(aria(svg).includes('Kosong: 0% (0 dari 0 tugas)'));
  });
  test('Progres: nama proyek aman dan semua warna berasal dari token', () => {
    const svg = chart('projectProgressChart', [{ id: 'p', name: '\" onload=\"x\"><script>x</script>', done: 1, total: 2 }]); safeSVG(svg);
    assert(svg.includes('&quot; onload=&quot;x&quot;&gt;&lt;script&gt;x&lt;/script&gt;'));
    assert(svg.includes('var(--success)') && svg.includes('var(--ink)'));
  });
  test('Grafik: keadaan kosong dan parameter null tetap SVG bermakna', () => {
    for (const name of ['donutChart', 'barChart', 'workloadChart', 'projectProgressChart']) {
      const svg = chart(name, null, null); safeSVG(svg);
      assert(/Belum ada/.test(svg), `${name} memerlukan penjelasan keadaan kosong.`);
    }
  });

  test('Seed: tersedia minimal lima profil, empat proyek, 24 tugas, 10 komentar, 15 aktivitas', () => {
    const value = requireSeed();
    for (const [key, minimum] of [['users', 5], ['projects', 4], ['tasks', 24], ['comments', 10], ['activity', 15]]) {
      assert(Array.isArray(value[key]) && value[key].length >= minimum, `Koleksi ${key} kurang lengkap.`);
      assert(new Set(value[key].map((item) => item.id)).size === value[key].length, `ID ${key} harus unik.`);
    }
  });
  test('Seed: profil placeholder tidak memiliki kredensial atau akun autentikasi nyata', () => {
    for (const user of requireSeed().users) {
      assert(/^demo-user-\d+$/.test(user.id)); equal(user.isPlaceholder, true); equal(user.role, 'member');
      assert(!user.email || user.email.endsWith('.test'), 'Gunakan alamat contoh, bukan identitas nyata.');
      assert(!('password' in user) && !('uid' in user), 'Seed bukan akun autentikasi.');
      assert(/^var\(--[a-z-]+\)$/.test(user.avatarColor), 'Warna profil harus merujuk token CSS.');
    }
  });
  test('Seed: alias proyek/tugas tertutup dan semua pemilik adalah aktor seed', () => {
    const value = requireSeed(); const users = new Set(['@currentUser', ...value.users.map((user) => user.id)]);
    const projects = new Map(value.projects.map((project) => [project.id, project]));
    for (const project of value.projects) {
      assert(/^demo-project-\d+$/.test(project.id)); equal(project.ownerId, '@currentUser');
      assert(project.memberIds.includes('@currentUser'));
      assert(project.memberIds.every((id) => users.has(id)));
      assert(new Set(project.memberIds).size === project.memberIds.length);
    }
    for (const task of value.tasks) {
      assert(/^demo-task-\d+$/.test(task.id)); equal(task.ownerId, '@currentUser'); equal(task.createdBy, '@currentUser');
      const project = projects.get(task.projectId); assert(project, `Proyek ${task.projectId} tidak tersedia.`);
      assert(!task.assigneeId || project.memberIds.includes(task.assigneeId), 'Penerima tugas harus anggota proyek.');
      equal(task.memberIds, project.memberIds);
    }
  });
  test('Seed: tanggal relatif valid tanpa tanggal tetap atau counter turunan', () => {
    const value = requireSeed();
    for (const project of value.projects) {
      assert(Number.isInteger(project.startDate_offset_days) && Number.isInteger(project.dueDate_offset_days));
      assert(project.startDate_offset_days <= project.dueDate_offset_days);
      assert(!('taskDone' in project) && !('taskTotal' in project));
    }
    for (const [collection, rows] of Object.entries(value)) {
      if (!Array.isArray(rows)) continue;
      for (const item of rows) {
        assert(Number.isInteger(item.createdAt_offset_days) && item.createdAt_offset_days <= 0, `${collection}: tanggal pembuatan relatif wajib.`);
        assert(!('createdAt' in item) && !('dueDate' in item) && !('startDate' in item), 'Tidak boleh menyimpan tanggal absolut.');
      }
    }
    for (const task of value.tasks) {
      assert(Number.isInteger(task.dueDate_offset_days));
      if (task.status === 'done') {
        assert(Number.isInteger(task.completedAt_offset_days) && task.completedAt_offset_days >= task.createdAt_offset_days && task.completedAt_offset_days <= 0);
      } else assert(!('completedAt_offset_days' in task), 'Tugas belum selesai tidak boleh punya tanggal selesai.');
    }
  });
  test('Seed: komentar dan aktivitas mengacu pada entitas yang ada, aktor aktivitas selalu pengguna saat ini', () => {
    const value = requireSeed(); const tasks = new Map(value.tasks.map((task) => [task.id, task]));
    const projects = new Set(value.projects.map((project) => project.id));
    for (const comment of value.comments) {
      assert(tasks.has(comment.taskId)); equal(comment.projectId, tasks.get(comment.taskId).projectId);
      equal(comment.authorId, '@currentUser'); assert(typeof comment.body === 'string' && comment.body.length > 0);
    }
    for (const event of value.activity) {
      equal(event.actorId, '@currentUser'); assert(projects.has(event.projectId));
      if (event.taskId) { assert(tasks.has(event.taskId)); equal(event.projectId, tasks.get(event.taskId).projectId); }
      assert(typeof event.type === 'string' && typeof event.message === 'string' && event.message.length > 0);
    }
  });
  test('Seed: semua status/prioritas serta perhatian dan tenggat tujuh hari terwakili', () => {
    const value = requireSeed();
    equal([...new Set(value.tasks.map((task) => task.status))].sort(), ['done', 'in_progress', 'review', 'todo']);
    equal([...new Set(value.tasks.map((task) => task.priority))].sort(), ['critical', 'high', 'low', 'medium']);
    assert(value.tasks.some((task) => task.status !== 'done' && task.dueDate_offset_days < 0));
    assert(value.tasks.some((task) => task.status !== 'done' && task.dueDate_offset_days === 0));
    assert(value.tasks.some((task) => task.status !== 'done' && task.dueDate_offset_days === 7));
    assert(value.tasks.some((task) => !task.assigneeId && task.status !== 'done'));
    assert(value.projects.some((project) => !value.tasks.some((task) => task.projectId === project.id)));
  });
  test('Seed: setelah tanggal digeser, dashboard memperoleh metrik yang dapat diperiksa', () => {
    const value = requireSeed();
    const date = (offset) => new Date(Date.UTC(2026, 10, 14 + offset)).toISOString().slice(0, 10);
    const result = build({ ...value, tasks: value.tasks.map((task) => ({ ...task, dueDate: date(task.dueDate_offset_days) })) }, '2026-11-14');
    equal(result.kpis, { activeProjects: 2, inProgressTasks: 6, overdueTasks: 5, completionRate: 25 });
    equal(result.statusCounts, { todo: 8, in_progress: 6, review: 4, done: 6 });
    equal(result.priorityCounts, { low: 6, medium: 8, high: 6, critical: 4 });
    equal(result.upcoming.length, 10); equal(result.attention.unassigned.length, 3);
    equal(result.attention.emptyProjects.map((project) => project.id), ['demo-project-4']);
  });

  const failures = []; let passed = 0;
  for (const { name, run } of cases) {
    try { await run(); passed++; report({ name, passed: true }); }
    catch (error) { failures.push({ name, error: error.message }); report({ name, passed: false, error: error.message }); }
  }
  return { passed, failed: failures.length, total: cases.length, failures };
}

if (globalThis.process?.versions?.node && process.argv[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const result = await runStatsTests({ report: ({ name, passed, error }) => console.log(`${passed ? 'LULUS' : 'GAGAL'} ${name}${error ? ` — ${error}` : ''}`) });
    console.log(`\n${result.passed} lulus, ${result.failed} gagal, ${result.total} pengujian.`);
    if (result.failed) process.exitCode = 1;
  }
}
