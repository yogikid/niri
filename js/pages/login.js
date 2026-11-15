import { escapeHTML as esc, readPreference, translateError } from '../core/utils.js';
import { brand, icon, windowDots, showFieldErrors, toast } from '../components/ui.js';

export function renderLogin(root, { authService, store, configured, signal, onEnterDemo, connectionState='idle', onRetryFirebase }) {
  let mode = 'login';
  const draw = () => {
    const state = store.get();
    const recovering = Boolean(state.authUser && !state.user);
    const title = recovering ? 'Satu langkah lagi.' : mode === 'register' ? 'Kenalan dulu, yuk.' : mode === 'reset' ? 'Mulai lagi.' : 'Kembali berkarya.';
    root.innerHTML = `<div class="auth-page"><aside class="auth-story" aria-label="Tentang NiRi">${brand()}<div class="auth-story-content"><p class="eyebrow">Rencana rapi. Tim happy.</p><h1>Pantau proyek.<br><span>Tuntaskan tugas.</span></h1><p class="auth-story-description">Ide besar butuh ruang untuk tumbuh. NiRi membantu tim kecil mengambil langkah yang berarti, satu per satu.</p><div class="auth-illustration" aria-hidden="true"><div class="mini-window"><div class="window-bar">${windowDots()}</div>${icon('folder')}</div><div class="connector"></div><div class="mini-window"><div class="window-bar">${windowDots()}</div>${icon('checks')}</div><div class="connector"></div><div class="mini-window"><div class="window-bar">${windowDots()}</div>${icon('heart')}</div></div></div><div class="auth-story-footer">${icon('heart')}Ruang kecil untuk rencana besar.</div></aside>
      <main class="auth-main" id="main-content" tabindex="-1"><div class="auth-card"><section class="window" aria-labelledby="auth-title"><div class="window-bar">${windowDots()}<span class="mono">${recovering ? 'MENYIAPKAN PROFIL' : 'SELAMAT DATANG DI NiRi'}</span></div><div class="window-body"><h2 id="auth-title">${title}</h2><p class="intro">${recovering ? 'Sesi Auth Anda sudah aktif. Profil Firestore perlu disiapkan sebelum membuka ruang kerja.' : mode === 'register' ? 'Buat akun untuk memulai rencana bersama tim.' : mode === 'reset' ? 'Kami bantu kirim tautan pengaturan ulang kata sandi.' : 'Masuk, temukan rencanamu, dan lanjutkan progresnya.'}</p>
      ${!configured ? `<div class="alert setup-warning" role="status">${icon('info')}<div><strong>${connectionState==='connecting'?'Menghubungkan Firebase…':connectionState==='error'?'Firebase belum terjangkau.':'Ruang kerja belum terhubung.'}</strong><p>${connectionState==='connecting'?'Anda tetap dapat membuka Mode Demo Lokal sambil menunggu.':connectionState==='error'?'Periksa internet atau gunakan Mode Demo Lokal.':'Isi konfigurasi Web App di js/core/firebase-config.js, aktifkan Email/Password, lalu publish Rules.'}</p>${connectionState==='error'?'<button class="text-button" data-retry-firebase>Coba koneksi lagi</button>':''}</div></div>` : ''}
      ${!recovering && mode !== 'reset' ? `<div class="auth-tabs" aria-label="Pilih akses akun"><button type="button" data-mode="login" aria-pressed="${mode === 'login'}">Masuk</button><button type="button" data-mode="register" aria-pressed="${mode === 'register'}">Daftar akun</button></div>` : ''}
      <form class="auth-form" novalidate>
      ${mode === 'register' || recovering ? `<div class="field"><label for="auth-name">Nama lengkap</label><input id="auth-name" name="name" type="text" autocomplete="name" minlength="2" maxlength="60" value="${esc(state.authUser?.displayName ?? '')}" placeholder="Nama panggilan tim Anda" ${recovering ? '' : 'required'} aria-describedby="auth-error-name"><span class="field-error" id="auth-error-name" data-error="name" aria-live="polite"></span></div>` : ''}
      ${!recovering ? `<div class="field"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="nama@contoh.com" required aria-describedby="auth-error-email"><span class="field-error" id="auth-error-email" data-error="email" aria-live="polite"></span></div>` : ''}
      ${!recovering && mode !== 'reset' ? `<div class="field"><label for="auth-password">Kata sandi</label><input id="auth-password" name="password" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" ${mode === 'register' ? 'minlength="8" maxlength="128"' : ''} placeholder="${mode === 'register' ? 'Minimal 8 karakter' : 'Kata sandi Anda'}" required aria-describedby="auth-error-password"><span class="field-error" id="auth-error-password" data-error="password" aria-live="polite"></span></div>` : ''}
      ${!recovering && mode === 'register' ? '<div class="field"><label for="auth-confirmPassword">Ulangi kata sandi</label><input id="auth-confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" maxlength="128" required placeholder="Sekali lagi, untuk memastikan" aria-describedby="auth-error-confirmPassword"><span class="field-error" id="auth-error-confirmPassword" data-error="confirmPassword" aria-live="polite"></span></div>' : ''}
      ${!recovering && mode !== 'reset' ? `<label class="checkbox-label"><input name="trusted" type="checkbox"${readPreference('trusted-device', 'false') === 'true' ? ' checked' : ''}><span>Perangkat pribadi: ingat sesi dan izinkan cache proyek (berlaku setelah muat ulang).</span></label>` : ''}
      <p class="field-error" id="auth-error" role="alert">${state.error ? esc(translateError(state.error)) : ''}</p>
      <button class="btn btn-dark btn-block" type="submit"${configured ? '' : ' disabled'}>${recovering ? 'Siapkan profil' : mode === 'register' ? 'Buat akun NiRi' : mode === 'reset' ? 'Kirim tautan pemulihan' : 'Masuk ke ruang kerja'}${icon('arrow')}</button>
      ${recovering ? '<button class="btn btn-block" type="button" data-signout>Keluar dari akun</button>' : `<button class="text-button" type="button" data-mode="${mode === 'reset' ? 'login' : 'reset'}">${mode === 'reset' ? '← Kembali masuk' : 'Lupa kata sandi?'}</button>`}
      </form>
      ${!recovering ? `<div style="margin-top:16px"><button class="btn btn-block" type="button" data-enter-demo>${icon('sparkle')}Mode Demo Lokal (Cadangan Offline)</button></div>` : ''}
      <div class="auth-note">${icon('lock')}<p>Login ditangani Firebase Authentication.<br>NiRi tidak menyimpan kata sandi Anda.</p></div></div></section><p class="auth-help">NiRi · Sistem Informasi Monitoring Proyek dan Tugas<br><a href="./tests/index.html">Buka pengujian kode</a></p></div></main></div>`;
    root.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { mode = button.dataset.mode; draw(); root.querySelector('input')?.focus(); }, { signal }));
    root.querySelector('[data-enter-demo]')?.addEventListener('click', onEnterDemo ?? (()=>{}), { signal });
    root.querySelector('[data-retry-firebase]')?.addEventListener('click',onRetryFirebase??(()=>{}),{signal});
    root.querySelector('[data-signout]')?.addEventListener('click', async () => { try { await authService.logout(); } catch (error) { toast(translateError(error), 'error'); } }, { signal });
    const form = root.querySelector('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!configured || form.getAttribute('aria-busy') === 'true') return;
      showFieldErrors(form); const errorNode = form.querySelector('#auth-error'); errorNode.textContent = '';
      const submit = form.querySelector('[type=submit]'); const label = submit.textContent;
      submit.disabled = true; submit.textContent = 'Mohon tunggu…'; form.setAttribute('aria-busy', 'true');
      const data = Object.fromEntries(new FormData(form)); data.trusted = form.elements.trusted?.checked ?? false;
      try {
        if (recovering) await authService.retryProfile(data.name);
        else if (mode === 'reset') { await authService.resetPassword(data); toast('Jika email terdaftar, tautan pemulihan akan dikirim. Periksa kotak masuk dan spam.'); }
        else if (mode === 'register') await authService.register(data);
        else await authService.login(data);
      } catch (error) {
        if (!signal.aborted && form.isConnected) { showFieldErrors(form, error); if (!error.fields) errorNode.textContent = translateError(error); }
      } finally {
        if (form.isConnected) { submit.disabled = false; submit.textContent = label; form.setAttribute('aria-busy', 'false'); }
      }
    }, { signal });
  };
  draw(); return () => {};
}
