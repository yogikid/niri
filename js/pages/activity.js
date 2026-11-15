import { translateError } from '../core/utils.js';
import { emptyState, icon } from '../components/ui.js';
import { activityFeed, normalizeActivityRow, ACTION_LABELS, ENTITY_LABELS } from '../components/activity-view.js';
export { activityFeed, activityTime } from '../components/activity-view.js';

export function renderActivity(root,{repository,user,signal}){
 let active=true,rows=[],people=new Map(),error=null,request=0;
 root.innerHTML=`<div class="page-heading"><div><span class="eyebrow">Ruang kerja / Aktivitas</span><h1>Setiap langkah<br>punya cerita.</h1><p>Jejak perubahan proyek, tugas, dan percakapan tim.</p></div><button class="btn" data-reload-activity>${icon('clock')}Muat terbaru</button></div><div class="task-filters"><div class="field"><label for="activity-action">Aksi</label><select id="activity-action"><option value="">Semua aksi</option>${Object.entries(ACTION_LABELS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div class="field"><label for="activity-entity">Jenis data</label><select id="activity-entity"><option value="">Semua jenis</option>${Object.entries(ENTITY_LABELS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div></div><p class="results-note">Maksimal 50 aktivitas terbaru yang dapat Anda lihat. Filter berlaku pada hasil yang dimuat.</p><section class="window"><div class="window-body" data-activity-results role="status">Memuat aktivitas…</div></section>`;
 const draw=()=>{
  if(!active||signal.aborted)return;const target=root.querySelector('[data-activity-results]');
  if(error){target.innerHTML=emptyState({title:'Aktivitas belum dapat dimuat',description:translateError(error),symbol:'warning'});return;}
  const action=root.querySelector('#activity-action').value,entity=root.querySelector('#activity-entity').value;
  target.innerHTML=activityFeed(rows.filter(r=>(!action||r.action===action)&&(!entity||r.entity===entity)),people);
 };
 const load=async()=>{
  const version=++request;error=null;root.querySelector('[data-reload-activity]').disabled=true;
  try{const[page,profiles]=await Promise.all([repository.listActivity({user,pageSize:50}),repository.listProfiles({pageSize:60})]);if(!active||signal.aborted||version!==request)return;rows=page.items.map(normalizeActivityRow);people=new Map(profiles.map(p=>[p.id,p]));draw();}
  catch(e){if(active&&!signal.aborted&&version===request){error=e;draw();}}
  finally{if(active&&!signal.aborted&&version===request)root.querySelector('[data-reload-activity]').disabled=false;}
 };
 root.querySelectorAll('select').forEach(select=>select.addEventListener('change',draw,{signal}));root.querySelector('[data-reload-activity]').addEventListener('click',load,{signal});
 load();return()=>{active=false;++request;};
}
