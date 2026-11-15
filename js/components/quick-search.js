import { escapeHTML as esc, translateError } from '../core/utils.js';
import { icon, showModal } from './ui.js';
import { TASK_LABELS } from './task-form.js';

export function openQuickSearch({projects,tasks,signal,onNavigate}){
 let active=true,version=0,loadingPromise;
 const dialog=showModal({title:'Pencarian cepat',signal,onClose:()=>{active=false;++version;},content:`<div class="stack"><div class="field"><label for="global-search-input">Cari proyek atau tugas</label><input id="global-search-input" type="search" placeholder="Nama, kode, judul, atau tag…" maxlength="120" autocomplete="off" autofocus></div><p class="text-small muted">Mencari pada maksimal 24 proyek dan 150 tugas yang dapat Anda lihat.</p><div class="global-results" data-search-results role="status">Ketik kata kunci untuk mencari.</div></div>`});
 if(!dialog)return null;
 const input=dialog.querySelector('input'),results=dialog.querySelector('[data-search-results]');
 const data=()=>loadingPromise??=(Promise.all([projects.list({pageSize:24}),tasks.list({pageSize:150})]));
 input.addEventListener('input',async()=>{
  const current=++version;const query=input.value.trim().toLocaleLowerCase('id-ID');
  if(!query){results.textContent='Ketik kata kunci untuk mencari.';return;}
  results.textContent='Mencari…';
  try{
   const [pPage,tPage]=await data();if(!active||signal?.aborted||current!==version)return;
   const p=pPage.items.filter(p=>`${p.name} ${p.code}`.toLocaleLowerCase('id-ID').includes(query)).slice(0,5);
   const t=tPage.items.filter(t=>`${t.title} ${(t.tags??[]).join(' ')}`.toLocaleLowerCase('id-ID').includes(query)).slice(0,10);
   results.innerHTML=[...p.map(p=>`<a class="global-result" href="#/projects/${encodeURIComponent(p.id)}" data-quick-jump>${icon('folder')}<span><strong>${esc(p.name)}</strong><small>${esc(p.code)} · Proyek</small></span></a>`),...t.map(t=>`<a class="global-result" href="#/tasks?task=${encodeURIComponent(t.id)}" data-quick-jump>${icon('checks')}<span><strong>${esc(t.title)}</strong><small>Tugas · ${esc(TASK_LABELS[t.status]??t.status)}</small></span></a>`)].join('')||'<p class="text-small muted">Tidak ada hasil yang cocok pada data termuat.</p>';
  }catch(e){if(active&&current===version){loadingPromise=null;results.textContent=translateError(e);}}
 });
 results.addEventListener('click',event=>{const link=event.target.closest('[data-quick-jump]');if(!link)return;dialog.close();if(onNavigate){event.preventDefault();onNavigate(link.getAttribute('href').replace(/^#/,''));}});return dialog;
}
