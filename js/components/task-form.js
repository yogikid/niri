import { PRIORITY, escapeHTML as esc, translateError, todayISO } from '../core/utils.js';
import { icon, showModal, showFieldErrors, setFormBusy, toast } from './ui.js';
export const TASK_LABELS = Object.freeze({ todo:'Akan dikerjakan', in_progress:'Sedang dikerjakan', review:'Peninjauan', done:'Selesai' });
const options=(values,selected)=>Object.entries(values).map(([id,label])=>`<option value="${esc(id)}"${id===selected?' selected':''}>${esc(label)}</option>`).join('');
const field=(name,label,html,full=false)=>`<div class="field${full?' field-full':''}"><label for="task-${name}">${label}</label>${html}<span id="task-error-${name}" data-error="${name}" class="field-error" aria-live="polite"></span></div>`;

export async function openTaskForm({task=null,projectId=null,projects,tasks,repository,user,signal,onSaved}){
 const value=task??{projectId:projectId??'',title:'',description:'',assigneeId:null,status:'todo',priority:'medium',dueDate:todayISO(),estimateHours:0,tags:[],position:0};
 const dialog=showModal({title:task?'Ubah tugas':'Tugas baru',signal,content:`<p class="dialog-note">Buat langkah yang jelas untuk tim. Kolom * wajib diisi. Tenggat boleh dikosongkan.</p><form novalidate class="stack"><div class="form-grid">
 ${field('projectId','Proyek *',`<select id="task-projectId" name="projectId" required aria-describedby="task-error-projectId"${task?' disabled':''}><option value="">Memuat proyek…</option></select>`,true)}
 ${field('title','Judul tugas *',`<input id="task-title" name="title" maxlength="120" required autofocus value="${esc(value.title)}" aria-describedby="task-error-title">`,true)}
 ${field('description','Deskripsi',`<textarea id="task-description" name="description" maxlength="4000" aria-describedby="task-error-description">${esc(value.description)}</textarea>`,true)}
 ${field('status','Status *',`<select id="task-status" name="status" aria-describedby="task-error-status">${options(TASK_LABELS,value.status)}</select>`)}
 ${field('priority','Prioritas *',`<select id="task-priority" name="priority" aria-describedby="task-error-priority">${options(PRIORITY,value.priority)}</select>`)}
 ${field('assigneeId','Penanggung jawab',`<select id="task-assigneeId" name="assigneeId" aria-describedby="task-error-assigneeId"><option value="">Belum ditugaskan</option></select>`)}
 ${field('dueDate','Tenggat',`<input id="task-dueDate" name="dueDate" type="date" min="1900-01-01" max="9999-12-31" value="${esc(value.dueDate??'')}" aria-describedby="task-error-dueDate">`)}
 ${field('estimateHours','Estimasi jam',`<input id="task-estimateHours" name="estimateHours" type="number" min="0" max="10000" step="0.5" value="${Number(value.estimateHours)||0}" aria-describedby="task-error-estimateHours">`)}
 ${field('tags','Tag (pisahkan koma)',`<input id="task-tags" name="tags" maxlength="200" value="${esc((value.tags??[]).join(', '))}" placeholder="desain, backend" aria-describedby="task-error-tags">`)}
 </div><p class="field-error" data-form-error role="alert"></p><div class="dialog-actions"><button type="button" class="btn" data-cancel>Batal</button><button type="submit" class="btn btn-dark" disabled>${icon('check')}Simpan tugas</button></div></form>`});
 if(!dialog)return null;
 const form=dialog.querySelector('form');let projectList=[],profiles=[];const projectSelect=form.elements.projectId;const assignee=form.elements.assigneeId;
 form.querySelector('[data-cancel]').addEventListener('click',()=>dialog.close());
 const populateAssignees=()=>{const p=projectList.find(p=>p.id===projectSelect.value);const ids=p?.memberIds??[];assignee.innerHTML='<option value="">Belum ditugaskan</option>'+ids.map(id=>`<option value="${esc(id)}"${id===value.assigneeId?' selected':''}>${esc(profiles.find(u=>u.id===id)?.name??id)}</option>`).join('');};
 try{
  const [page,people]=await Promise.all([projects.list({pageSize:24}),repository.listProfiles({pageSize:60})]);if(signal.aborted||!dialog.isConnected)return dialog;
  projectList=page.items.filter(p=>user.role==='admin'||p.memberIds.includes(user.id));profiles=people;
  if(value.projectId&&!projectList.some(p=>p.id===value.projectId)){const p=await projects.get(value.projectId);if(p&&(user.role==='admin'||p.memberIds.includes(user.id)))projectList.push(p);}
  if(signal.aborted||!dialog.isConnected)return dialog;
  projectSelect.innerHTML='<option value="">Pilih proyek</option>'+projectList.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');projectSelect.value=value.projectId||projectList[0]?.id||'';populateAssignees();
  form.querySelector('[type=submit]').disabled=!projectList.length;
  if(!projectList.length)form.querySelector('[data-form-error]').textContent='Belum ada proyek. Buat proyek terlebih dahulu sebelum menambahkan tugas.';
  if(page.hasMore){const note=document.createElement('p');note.className='text-small muted';note.textContent='Pilihan menampilkan 24 proyek pertama. Untuk proyek lain, tambah tugas dari halaman detail proyek.';projectSelect.after(note);}
 }catch(e){if(dialog.isConnected)form.querySelector('[data-form-error]').textContent=translateError(e);}
 projectSelect.addEventListener('change',populateAssignees);
 form.addEventListener('submit',async event=>{event.preventDefault();if(form.getAttribute('aria-busy')==='true')return;showFieldErrors(form);form.querySelector('[data-form-error]').textContent='';const input=Object.fromEntries(new FormData(form));Object.assign(input,{projectId:task?.projectId??input.projectId,assigneeId:input.assigneeId||null,dueDate:input.dueDate||null,estimateHours:Number(input.estimateHours),tags:String(input.tags??'').split(',').map(t=>t.trim()).filter(Boolean),position:task?.position??0,expectedUpdatedAt:task?.updatedAt});setFormBusy(form,true);try{const result=task?await tasks.update(task.id,input,{signal}):await tasks.create(input,{signal});if(!signal.aborted){dialog.close();toast(task?'Tugas diperbarui.':'Tugas baru tersimpan.');onSaved?.(result);}}catch(e){if(dialog.isConnected){showFieldErrors(form,e);if(!e.fields)form.querySelector('[data-form-error]').textContent=translateError(e);}}finally{if(form.isConnected)setFormBusy(form,false);}});
 return dialog;
}
