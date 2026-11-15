import { ROLE, escapeHTML as esc } from '../core/utils.js';
import { avatar, brand, icon } from './ui.js';
const ROUTES=[['/dashboard','Dasbor','grid'],['/projects','Proyek','folder'],['/tasks','Tugas','checks'],['/team','Tim','users'],['/activity','Aktivitas','clock'],['/settings','Pengaturan','settings']];
export function renderShell(root,{user,page,signal,onLogout,onSearch,mode='firebase'}){
 const isActive=path=>page===path.slice(1)||(page==='project-detail'&&path==='/projects');
 const nav=(items,mobile=false)=>items.map(([path,label,symbol])=>`<a href="#${path}" class="${mobile?'':'nav-link'}"${isActive(path)?' aria-current="page"':''} aria-label="${label}">${icon(symbol)}<span class="${mobile?'':'nav-label'}">${label}</span></a>`).join('');
 const label=page==='project-detail'?'Detail proyek':ROUTES.find(([p])=>p.slice(1)===page)?.[1]??'Tidak ditemukan';
 root.innerHTML=`<div class="app-shell"><aside class="sidebar" aria-label="Navigasi utama"><div class="brand"><a href="#/dashboard" aria-label="NiRi, halaman dasbor">${brand()}</a><p>Pantau proyek. Tuntaskan tugas.</p></div><nav class="nav-section"><p class="eyebrow">Ruang kerja</p>${nav(ROUTES)}</nav><div class="sidebar-note">${icon('sparkle')}<strong>Mulai kecil.<br>Selesaikan besar.</strong><p>Satu tugas selesai adalah satu langkah maju untuk timmu.</p></div><div class="profile">${avatar(user.name)}<div class="profile-info grow"><p class="profile-name">${esc(user.name)}</p><p class="profile-role">${esc(ROLE[user.role]??user.role)}${mode==='demo'?' · Demo lokal':''}</p></div><button class="btn btn-icon" type="button" data-logout aria-label="Keluar dari akun">${icon('logout')}</button></div></aside><div class="main-area"><header class="topbar"><div class="breadcrumb"><span class="breadcrumb-root">Ruang kerja</span><span class="breadcrumb-slash">/</span><strong>${label}</strong></div><div class="topbar-right"><div class="connection" id="connection-state" data-state="cache" role="status"><i aria-hidden="true"></i><span>${mode==='demo'?'DEMO LOKAL':'MENUNGGU DATA'}</span></div><button class="quick-search" type="button" data-search>${icon('search')}<span>Cari cepat</span><kbd>/</kbd></button><button class="btn btn-icon btn-quiet" type="button" data-logout aria-label="Keluar dari akun">${icon('logout')}</button></div></header>${mode==='demo'?'<div class="demo-banner" role="status"><span>Mode Demo Lokal — data hanya tersimpan di browser ini dan tidak tersinkron ke Firebase.</span><span class="badge">TIDAK TERSINKRON</span></div>':''}<main class="page" id="main-content" tabindex="-1"></main></div><nav class="mobile-nav" aria-label="Navigasi seluler">${nav(ROUTES.slice(0,4),true)}<button type="button" data-more aria-label="Menu lainnya" aria-expanded="false">${icon('settings')}Lainnya</button></nav><div class="mobile-more" data-more-menu hidden>${nav(ROUTES.slice(4),true)}<button class="btn" data-logout>Keluar akun</button></div></div>`;
 root.querySelectorAll('[data-logout]').forEach(b=>b.addEventListener('click',onLogout,{signal}));root.querySelector('[data-search]').addEventListener('click',onSearch,{signal});
 const more=root.querySelector('[data-more]'),menu=root.querySelector('[data-more-menu]');
 const closeMore=(restoreFocus=false)=>{menu.hidden=true;more.setAttribute('aria-expanded','false');if(restoreFocus)more.focus();};
 more.setAttribute('aria-controls','mobile-more-menu');menu.id='mobile-more-menu';
 more.addEventListener('click',()=>{const opening=menu.hidden;menu.hidden=!opening;more.setAttribute('aria-expanded',String(opening));if(opening)menu.querySelector('a')?.focus();},{signal});
 root.ownerDocument.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();closeMore(true);}},{signal});
 root.ownerDocument.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!more.contains(event.target))closeMore();},{signal});
 menu.addEventListener('click',event=>{if(event.target.closest('a'))closeMore();},{signal});
 return root.querySelector('#main-content');
}
export function updateConnection(root,{fromCache=true,pending=false,mode='firebase'}={}){
 const node=root.querySelector('#connection-state');if(!node)return;
 const state=mode==='demo'?'demo':!navigator.onLine?'offline':pending?'pending':fromCache?'cache':'online';node.dataset.state=state;
 node.querySelector('span').textContent={demo:'DEMO LOKAL · TIDAK TERSINKRON',offline:'OFFLINE · DATA CACHE',pending:'MENYINKRONKAN',cache:'DATA CACHE · BELUM TERVERIFIKASI',online:'TERSIMPAN DI FIREBASE'}[state];
 const main=root.querySelector('#main-content');root.querySelector('#offline-banner')?.remove();
 if(state==='offline'||state==='pending'){
 const banner=document.createElement('div');banner.id='offline-banner';banner.className='alert alert-warning';banner.setAttribute('role','status');banner.innerHTML=`${icon('warning')}<p>${state==='offline'?'Anda sedang offline. Data cache mungkin belum lengkap. Operasi transaksi membutuhkan koneksi; jangan mengirim ulang tindakan yang sama.':'Perubahan menunggu konfirmasi server. Jangan tutup tab atau mengirim ulang.'}</p>`;main?.prepend(banner);}
}
