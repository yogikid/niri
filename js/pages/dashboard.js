import { escapeHTML as esc, formatDate, daysUntil, translateError } from '../core/utils.js';
import { icon, emptyState, windowDots } from '../components/ui.js';
import { buildStats } from '../services/stats-service.js';
import { donutChart, barChart, workloadChart, projectProgressChart } from '../components/charts.js';
import { activityFeed, normalizeActivityRow } from '../components/activity-view.js';

export function renderDashboard(root,{projects,tasks,repository,user,signal,setConnection}){
 // NiRi: <=24 proyek +150 tugas +60 profil +10 aktivitas =244 dokumen awal.
 // Lookup Rules, query kosong, reconnect, dan indeks dapat menambah read; bukan batas tagihan mutlak.
 let active=true,projectRows=[],taskRows=[],activityRows=[],people=new Map(),error=null,loading=true,truncated=false;
 root.innerHTML=`<div class="page-heading"><div><span class="eyebrow">Ruang kerja / Dasbor</span><h1>Satu layar.<br>Semua progres.</h1><p>Pantau kesehatan proyek, beban tim, dan tenggat kritis dalam satu pandangan.</p></div><div class="row wrap"><a href="#/projects" class="btn">${icon('folder')}Buka proyek</a><a href="#/tasks" class="btn btn-dark">${icon('checks')}Buka papan tugas</a></div></div><div data-dashboard-content><p class="muted" role="status">Memuat dasbor…</p></div>`;
 const draw=()=>{if(!active||signal.aborted)return;const content=root.querySelector('[data-dashboard-content]');if(error){content.innerHTML=emptyState({title:'Dasbor belum dapat dimuat',description:translateError(error),symbol:'warning',action:'<button class="btn" data-retry-dash>Coba kembali</button>'});return;}if(loading)return;
 const stats=buildStats({projects:projectRows,tasks:taskRows,activity:activityRows,users:[...people.values()]});
 const limitedRows=rows=>rows.slice(0,10);
 content.innerHTML=`
 ${truncated?'<div class="alert alert-warning" role="status"><p><strong>Data terbatas.</strong> KPI, grafik, dan panel hanya menghitung hasil yang dimuat (maksimal 24 proyek dan 150 tugas), bukan total seluruh ruang kerja. Buka proyek untuk memeriksa detail lengkap.</p></div>':''}
 <div class="project-summary"><div class="summary-card"><div><span>Total proyek aktif</span><strong>${stats.kpis.activeProjects.toString().padStart(2,'0')}</strong></div>${icon('folder')}</div><div class="summary-card"><div><span>Tugas berjalan</span><strong>${stats.kpis.inProgressTasks.toString().padStart(2,'0')}</strong></div>${icon('checks')}</div><div class="summary-card"><div><span>Tugas terlambat</span><strong>${stats.kpis.overdueTasks.toString().padStart(2,'0')}</strong></div>${icon('warning')}</div><div class="summary-card"><div><span>Tingkat penyelesaian</span><strong>${stats.kpis.completionRate}%</strong></div>${icon('heart')}</div></div>
 <div class="dashboard-grid">
 <section class="window"><div class="window-bar">${windowDots()}<h2>Status tugas</h2></div><div class="window-body">${donutChart(stats.statusCounts,{todo:'Akan dikerjakan',in_progress:'Sedang jalan',review:'Peninjauan',done:'Selesai'})}</div></section>
 <section class="window"><div class="window-bar">${windowDots()}<h2>Tugas per prioritas</h2></div><div class="window-body">${barChart(stats.priorityCounts,{critical:'Kritis',high:'Tinggi',medium:'Sedang',low:'Rendah'})}</div></section>
 <section class="window"><div class="window-bar">${windowDots()}<h2>Beban kerja anggota · 10 teratas</h2></div><div class="window-body">${workloadChart(limitedRows(stats.workload))}</div></section>
 <section class="window"><div class="window-bar">${windowDots()}<h2>Progres proyek · 10 termuat</h2></div><div class="window-body">${projectProgressChart(limitedRows(stats.projectProgress))}</div></section>
 <section class="window"><div class="window-bar">${windowDots()}<h2>Tenggat 7 hari ke depan (${stats.upcoming.length})</h2></div><div class="window-body">${stats.upcoming.length?`<ul class="dashboard-list">${stats.upcoming.map(t=>`<li><a href="#/tasks?task=${encodeURIComponent(t.id)}">${esc(t.title)}</a><span class="muted">${formatDate(t.dueDate)} · ${daysUntil(t.dueDate)===0?'Hari ini':`${daysUntil(t.dueDate)} hari lagi`}</span></li>`).join('')}</ul>`:'<p class="text-small muted">Tidak ada tugas jatuh tempo dalam 7 hari ke depan.</p>'}</div></section>
 <section class="window"><div class="window-bar">${windowDots()}<h2>Perlu perhatian (${stats.attention.overdue.length+stats.attention.emptyProjects.length+stats.attention.unassigned.length})</h2></div><div class="window-body"><ul class="dashboard-list">${stats.attention.overdue.map(t=>`<li><a href="#/tasks?task=${encodeURIComponent(t.id)}" class="text-danger">⚠ Terlambat: ${esc(t.title)}</a><span class="muted">Tenggat ${formatDate(t.dueDate)}</span></li>`).join('')}${stats.attention.emptyProjects.map(p=>`<li><a href="#/projects/${encodeURIComponent(p.id)}">Proyek tanpa tugas: ${esc(p.name)}</a><span class="muted">Belum ada langkah kerja</span></li>`).join('')}${stats.attention.unassigned.map(t=>`<li><a href="#/tasks?task=${encodeURIComponent(t.id)}">Tugas tanpa PIC: ${esc(t.title)}</a><span class="muted">${formatDate(t.dueDate)}</span></li>`).join('')}${!stats.attention.overdue.length&&!stats.attention.emptyProjects.length&&!stats.attention.unassigned.length?'<li><span class="muted">Semua proyek dan tugas dalam kondisi baik.</span></li>':''}</ul></div></section>
 <section class="window dashboard-full"><div class="window-bar">${windowDots()}<h2>10 Aktivitas terbaru</h2></div><div class="window-body">${activityFeed(activityRows,people)}</div></section>
 </div><p class="results-note" style="margin-top:24px">Ringkasan maksimal 24 proyek dan 150 tugas yang dapat Anda lihat. Grafik dihitung dari tugas termuat. Muatan awal ≤244 dokumen; baca tambahan untuk Rules, indeks, dan koneksi ulang tidak termasuk estimasi.</p>`;
 };
 const load=async()=>{error=null;loading=true;try{
  const [pPage,tPage,aPage,users]=await Promise.all([projects.list({pageSize:24}),tasks.list({pageSize:150}),repository.listActivity({user,pageSize:10}),repository.listProfiles({pageSize:60})]);
  if(!active||signal.aborted)return;projectRows=pPage.items;taskRows=tPage.items;activityRows=aPage.items.map(normalizeActivityRow);people=new Map(users.map(u=>[u.id,u]));truncated=Boolean(pPage.hasMore||tPage.hasMore||users.length>=60);loading=false;draw();setConnection({fromCache:pPage.fromCache||tPage.fromCache,pending:pPage.pending||tPage.pending});
 }catch(e){if(active&&!signal.aborted){error=e;loading=false;draw();}}};
 root.addEventListener('click',e=>{if(e.target.closest('[data-retry-dash]'))load();},{signal});
 load();return()=>{active=false;};
}
