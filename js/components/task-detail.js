import { escapeHTML as esc, PRIORITY, formatDate, translateError } from '../core/utils.js';
import { icon, showModal, confirmAction, toast } from './ui.js';
import { TASK_LABELS, openTaskForm } from './task-form.js';

export async function openTaskDetail({id,tasks,comments,projects,repository,user,signal}){
 let task;
 try{task=await tasks.get(id);if(!task)throw{code:'not-found'};}
 catch(error){if(!signal.aborted)toast(translateError(error),'error');return null;}
 if(signal.aborted)return null;
 const controller=new AbortController();let off=()=>{};let active=true;let profiles=new Map([[user.id,user]]);let commentRows=[],commentError=null;
 const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
 const cleanup=()=>{if(!active)return;active=false;off();controller.abort();signal.removeEventListener('abort',abort);};
 const dialog=showModal({title:'Detail tugas',signal,onClose:cleanup,content:`<div class="stack"><div class="row spread wrap"><span class="badge task-status-${esc(task.status)}">${esc(TASK_LABELS[task.status])}</span><span class="badge">Prioritas ${esc(PRIORITY[task.priority])}</span></div><h3>${esc(task.title)}</h3><p class="detail-description">${esc(task.description||'Belum ada deskripsi.')}</p><div class="row wrap text-small"><span>Tenggat: ${formatDate(task.dueDate)}</span><span>Estimasi: ${Number(task.estimateHours)||0} jam</span></div><div class="row wrap">${(task.tags??[]).map(tag=>`<span class="badge">#${esc(tag)}</span>`).join('')}</div><div class="row wrap"><button class="btn" data-edit-task>${icon('edit')}Ubah tugas</button>${tasks.canDelete(task)?`<button class="btn btn-danger" data-delete-task>${icon('trash')}Hapus tugas</button>`:''}</div><section class="stack" aria-label="Komentar tugas"><h3>Percakapan tim</h3><div data-comments role="status">Memuat komentar…</div><form data-comment-form class="stack"><div class="field"><label for="comment-body">Tulis komentar (maks. 500 karakter)</label><textarea id="comment-body" name="body" maxlength="500" required rows="3"></textarea></div><p data-comment-error class="field-error" role="alert"></p><button class="btn btn-dark" type="submit">${icon('plus')}Kirim komentar</button></form></section></div>`});
 if(!dialog){cleanup();return null;}
 const draw=()=>{
  if(!active||!dialog.isConnected)return;const box=dialog.querySelector('[data-comments]');
  if(commentError){box.textContent=translateError(commentError);return;}
  box.innerHTML=commentRows.length?commentRows.map(comment=>`<article class="comment-item"><div class="row spread"><strong>${esc(profiles.get(comment.authorId)?.name??'Anggota')}</strong>${comments.canDelete(comment,task)?`<button class="btn btn-icon btn-quiet" type="button" data-delete-comment="${esc(comment.id)}" aria-label="Hapus komentar">${icon('trash')}</button>`:''}</div><p>${esc(comment.body)}</p></article>`).join(''):'<p class="muted text-small">Belum ada komentar. Mulai percakapan pertama.</p>';
 };
 off=comments.watch(task.id,page=>{if(!active)return;commentRows=page.items??page;commentError=null;draw();},error=>{commentError=error;draw();});
 repository.listProfiles({pageSize:60}).then(people=>{if(!active)return;profiles=new Map([[user.id,user],...people.map(p=>[p.id,p])]);draw();}).catch(()=>{});
 dialog.querySelector('[data-edit-task]').addEventListener('click',()=>{dialog.close();openTaskForm({task,tasks,projects,repository,user,signal,onSaved:updated=>openTaskDetail({id:updated?.id??task.id,tasks,comments,projects,repository,user,signal})});});
 dialog.querySelector('[data-delete-task]')?.addEventListener('click',async()=>{
  const yes=await confirmAction({title:'Hapus tugas?',message:`“${task.title}” beserta komentarnya akan dihapus permanen.`,signal:controller.signal});if(!yes||!active)return;
  const button=dialog.querySelector('[data-delete-task]');button.disabled=true;
  try{await tasks.remove(task.id,{signal:controller.signal});if(active){dialog.close();toast('Tugas dan komentar terkait dihapus.');}}
  catch(error){if(active)toast(translateError(error),'error');}
  finally{if(button.isConnected)button.disabled=false;}
 });
 dialog.querySelector('[data-comments]').addEventListener('click',async event=>{
  const button=event.target.closest('[data-delete-comment]');if(!button)return;
  const yes=await confirmAction({title:'Hapus komentar?',message:'Komentar ini akan dihapus permanen.',signal:controller.signal});if(!yes||!active)return;
  try{await comments.remove(button.dataset.deleteComment,{signal:controller.signal});if(active)toast('Komentar dihapus.');}catch(error){if(active)toast(translateError(error),'error');}
 });
 const form=dialog.querySelector('[data-comment-form]');form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;form.querySelector('[data-comment-error]').textContent='';
  try{await comments.add(task.id,form.elements.body.value,{signal:controller.signal});if(active){form.reset();toast('Komentar terkirim.');}}
  catch(error){if(active)form.querySelector('[data-comment-error]').textContent=error.fields?.body??translateError(error);}
  finally{if(form.isConnected)button.disabled=false;}
 });
 return dialog;
}
