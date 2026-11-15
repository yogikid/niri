import { ROLE, escapeHTML as esc, readPreference, writePreference, todayISO, translateError } from '../core/utils.js';
import { FIREBASE_VERSION } from '../core/firebase.js';
import { icon, avatar, toast, windowDots, confirmAction } from '../components/ui.js';

export function renderSettings(root, { user, dataService, signal, mode = 'firebase' }) {
  const trusted = readPreference('trusted-device', 'false') === 'true';
  root.innerHTML = `<div class="page-heading"><div><span class="eyebrow">Ruang kerja / Pengaturan</span><h1>Atur ruangmu.</h1><p>Kenali sesi Anda, kelola data, dan sesuaikan perangkat yang digunakan.</p></div></div><div class="settings-grid">
    <section class="window"><div class="window-bar">${windowDots()}<h2>Akun Anda</h2></div><div class="window-body"><div class="row">${avatar(user.name, 0, 'avatar-large')}<div><h3>${esc(user.name)}</h3><p class="text-small muted">${esc(user.email || 'Tanpa email')}</p></div></div><div><span class="badge">${esc(ROLE[user.role] ?? user.role)}</span></div><div class="settings-code">UID: ${esc(user.id)}<br>Mode: ${mode === 'demo' ? 'Mode Demo Lokal (localStorage)' : 'Firebase Auth + Cloud Firestore'}<br>SDK: ${FIREBASE_VERSION}</div><p class="text-small muted">Perubahan role dibaca ulang saat Anda masuk atau memuat ulang aplikasi. Security Rules tetap mengevaluasi role di server untuk setiap request.</p></div></section>
    
    <section class="window"><div class="window-bar">${windowDots()}<h2>Alat Data & Cadangan</h2></div><div class="window-body stack">
      <div>
        <h3>Ekspor Data Cadangan</h3>
        <p class="text-small muted">Unduh data yang boleh Anda lihat (proyek, tugas, komentar, aktivitas) ke file .json.</p>
        <button class="btn btn-dark" type="button" data-export>${icon('checks')}Ekspor data (.json)</button>
      </div>
      ${user.role === 'admin' ? `
      <hr class="settings-divider">
      <div>
        <h3>Seed Data Demo (Khusus Admin)</h3>
        <p class="text-small muted">Menulis data demo (5 profil demo, 4 proyek, 24 tugas, 10 komentar, 15 aktivitas) dengan tanggal relatif terhadap hari ini. Operasi ini bersifat idempotent.</p>
        <button class="btn" type="button" data-seed>${icon('sparkle')}Seed data demo</button>
      </div>
      <hr class="settings-divider">
      <div>
        <h3>Hitung Ulang Counter Proyek</h3>
        <p class="text-small muted">Menghitung ulang taskTotal dan taskDone langsung dari tugas aktual untuk memperbaiki drift.</p>
        <button class="btn" type="button" data-recount>${icon('clock')}Hitung ulang counter</button>
      </div>` : ''}
    </div></section>

    ${mode==='demo'?'<section class="window"><div class="window-bar"><h2>Data demo lokal</h2></div><div class="window-body stack"><p class="text-small">Data demo lama tidak diubah otomatis agar hasil latihan Anda tetap tersimpan. Jika ingin contoh tanggal relatif terbaru, mulai ulang data demo lokal saja. Data Firebase tidak tersentuh.</p><button class="btn btn-danger" type="button" data-reset-demo>Mulai ulang demo lokal</button></div></section>':''}
    <section class="window"><div class="window-bar">${windowDots()}<h2>Privasi perangkat</h2></div><div class="window-body"><label class="checkbox-label"><input type="checkbox" id="trusted-device"${trusted ? ' checked' : ''}><span>Izinkan cache persisten di perangkat pribadi ini.</span></label><p class="text-small muted">Berlaku setelah muat ulang. Cache menyimpan data yang pernah dibaca, bukan salinan semua data. Hindari mengaktifkannya di komputer kampus atau perangkat bersama.</p><div class="alert">${icon('lock')}<p>Keluar dari akun tidak otomatis menghapus cache disk Firestore. Untuk membersihkan data lama, tutup semua tab NiRi lalu hapus data situs melalui pengaturan browser.</p></div><button class="btn" type="button" id="reload-app">Muat ulang aplikasi${icon('arrow')}</button></div></section>
    
    <section class="window"><div class="window-bar">${windowDots()}<h2>Pengujian & Verifikasi</h2></div><div class="window-body stack">
      <h3>Pengujian Mandiri di Browser</h3>
      <p class="text-small">Seluruh logika murni, adapter, validasi, dan alur aplikasi dapat diuji langsung tanpa library tambahan.</p>
      <div class="row wrap">
        <a class="btn" href="./tests/index.html">${icon('checks')}Pengujian unit & UI</a>
        <a class="btn" href="./tests/backend.html">${icon('folder')}Pengujian backend</a>
        <a class="btn" href="./tests/stats.html">${icon('grid')}Pengujian statistik</a>
      </div>
    </div></section>
  </div>`;

  root.querySelector('#trusted-device')?.addEventListener('change', (event) => {
    const saved = writePreference('trusted-device', event.target.checked);
    toast(saved ? 'Preferensi tersimpan. Muat ulang agar kebijakan cache baru berlaku.' : 'Preferensi belum tersimpan. Izinkan penyimpanan situs.', saved ? 'success' : 'error');
  }, { signal });
  root.querySelector('#reload-app')?.addEventListener('click', () => location.reload(), { signal });

  root.querySelector('[data-export]')?.addEventListener('click', async () => {
    const button=root.querySelector('[data-export]');
    if (!dataService || button.disabled) return;
    button.disabled=true;
    try {
      toast('Menyiapkan file cadangan…');
      const data = await dataService.exportData();
      if(signal.aborted)return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `niri-backup-${todayISO()}.json`;
      document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      toast('File cadangan berhasil diunduh.');
    } catch (e) {
      if(!signal.aborted)toast(translateError(e), 'error');
    } finally { if(button.isConnected)button.disabled=false; }
  }, { signal });

  root.querySelector('[data-seed]')?.addEventListener('click', async () => {
    if (!dataService) return;
    const ok = await confirmAction({
      title: 'Tulis data demo?',
      message: 'Data demo akan ditambahkan ke proyek Anda dengan tanggal relatif hari ini. Operasi ini tidak menghapus data yang sudah ada.',
      label: 'Ya, tulis demo',
      destructive: false,
      symbol: 'sparkle',
      signal,
    });
    if (!ok || signal.aborted) return;
    const btn = root.querySelector('[data-seed]');
    if (btn) btn.disabled = true;
    try {
      toast('Mengambil data/seed.json…');
      const res = await fetch(new URL('../../data/seed.json', import.meta.url));
      if (!res.ok) throw new Error('Gagal memuat data/seed.json');
      const seedData = await res.json();
      if(signal.aborted)return;
      toast('Menulis data demo…');
      const result = await dataService.seed(seedData, { signal });
      const c = result?.created;
      toast(c ? `Data demo siap (${c.projects ?? 0} proyek baru, ${c.tasks ?? 0} tugas baru).` : 'Data demo selesai diproses.');
    } catch (e) {
      toast(translateError(e), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }, { signal });

  root.querySelector('[data-recount]')?.addEventListener('click', async () => {
    if (!dataService) return;
    const btn = root.querySelector('[data-recount]');
    if (btn) btn.disabled = true;
    try {
      toast('Menghitung ulang counter proyek…');
      const result = await dataService.recount({
        signal,
        onProgress: (p) => {
          if (btn && p) btn.textContent = p.total ? `Memproses (${p.completed}/${p.total})…` : `Memproses · ${p.completed} selesai…`;
        },
      });
      toast(`Counter selesai dihitung ulang untuk ${result?.recounted ?? 'semua'} proyek.`);
    } catch (e) {
      toast(translateError(e), 'error');
    } finally {
      if (btn && btn.isConnected) {
        btn.disabled = false;
        btn.innerHTML = `${icon('clock')}Hitung ulang counter`;
      }
    }
  }, { signal });

  root.querySelector('[data-reset-demo]')?.addEventListener('click',async()=>{
    if(mode!=='demo')return;
    const yes=await confirmAction({title:'Mulai ulang demo lokal?',message:'Semua perubahan pada demo lokal di browser ini akan dihapus. Data akun/proyek Firebase tidak berubah. Setelah muat ulang, contoh demo akan dibuat kembali.',label:'Hapus dan buat ulang demo',signal});
    if(!yes||signal.aborted)return;
    try{localStorage.removeItem('niri:demo-data');location.reload();}catch(error){toast(translateError(error),'error');}
  },{signal});
  return () => {};
}
