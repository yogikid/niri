import { escapeHTML as esc } from '../core/utils.js';
import { avatar } from './ui.js';
export const ACTION_LABELS=Object.freeze({create:'Dibuat',update:'Diperbarui',delete:'Dihapus',move:'Dipindahkan'});
export const ENTITY_LABELS=Object.freeze({project:'Proyek',task:'Tugas',comment:'Komentar',user:'Anggota'});
const LEGACY={task_created:['task','create'],task_updated:['task','update'],task_completed:['task','move'],task_deleted:['task','delete'],comment_added:['comment','create'],project_deleted:['project','delete']};
export function activityTime(value){
 const date=value?.toDate?.()??(value?.seconds!==undefined?new Date(value.seconds*1000):value?new Date(value):null);
 return date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(date):'Menunggu waktu server';
}
export function normalizeActivityRow(row={}){
 const legacy=LEGACY[row.type]??['project','update'];
 return {...row,entity:row.entity??legacy[0],action:row.action??legacy[1],entityId:row.entityId??row.taskId??row.projectId??row.deletedProjectId??row.actorId,summary:row.summary??row.message??'Perubahan ruang kerja'};
}
export function activityFeed(rows,people=new Map()){
 return rows.length?`<ol class="activity-feed">${rows.map(raw=>{const row=normalizeActivityRow(raw);return `<li>${avatar(people.get(row.actorId)?.name??'Anggota')}<div class="grow"><div class="row wrap"><strong>${esc(people.get(row.actorId)?.name??'Anggota tim')}</strong><span class="badge">${esc(ACTION_LABELS[row.action]??'Diperbarui')}</span><span class="text-small muted">${esc(ENTITY_LABELS[row.entity]??'Data')}</span></div><p>${esc(row.summary)}</p><span class="mono muted">${activityTime(row.createdAt)}</span>${row.projectId?`<a class="text-small" href="#/projects/${encodeURIComponent(row.projectId)}">Buka proyek →</a>`:''}</div></li>`;}).join('')}</ol>`:'<p class="muted text-small">Belum ada aktivitas yang dapat Anda lihat.</p>';
}
