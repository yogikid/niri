const tests=[];const it=(name,run)=>tests.push({name,run});const assert=(value,message='Pernyataan gagal')=>{if(!value)throw Error(message);};
const waitFor=async(predicate)=>{for(let i=0;i<50;i++){if(predicate())return;await Promise.resolve();}throw Error('Kondisi belum terpenuhi');};
export async function runCorrectionTests(){
 const {openTaskDetail}=await import('../js/components/task-detail.js');
 const {showModal}=await import('../js/components/ui.js');
 const {renderProjectDetail}=await import('../js/pages/project-detail.js');
 const {openProjectForm}=await import('../js/components/project-form.js');
 const {openQuickSearch}=await import('../js/components/quick-search.js');
 const {createDemoSession}=await import('../js/core/demo-session.js');
 const task={id:'task-correction',projectId:'p',ownerId:'owner',createdBy:'owner',memberIds:['owner'],title:'Judul tugas',description:'Uraian',status:'todo',priority:'medium',tags:[],dueDate:null,estimateHours:2};
 it('komentar gagal tetap menampilkan error setelah profil selesai',async()=>{
  let resolveProfiles;const profiles=new Promise(resolve=>{resolveProfiles=resolve;});let error;
  const controller=new AbortController();const dialog=await openTaskDetail({id:task.id,user:{id:'owner',name:'Pemilik'},tasks:{get:async()=>task,canDelete:()=>false},comments:{canDelete:()=>false,watch(_id,_next,fail){error=fail;return()=>{};}},projects:{},repository:{listProfiles:()=>profiles},signal:controller.signal});
  try{error({code:'permission-denied'});resolveProfiles([]);await Promise.resolve();await Promise.resolve();assert(dialog.querySelector('[data-comments]').textContent.includes('izin'),'Error ditimpa empty state');}finally{dialog.close();controller.abort();}
 });
 it('detail ditutup menghentikan listener komentar saat itu juga',async()=>{
  let active=0;const controller=new AbortController();const dialog=await openTaskDetail({id:task.id,user:{id:'owner',name:'Pemilik'},tasks:{get:async()=>task,canDelete:()=>false},comments:{canDelete:()=>false,watch(){active++;return()=>{active--;};}},projects:{},repository:{listProfiles:async()=>[]},signal:controller.signal});
  dialog.close();assert(active===0,'Listener bertahan sampai event close di frame berikutnya');controller.abort();
 });
 it('menutup modal membersihkan DOM dan callback satu kali tanpa menunggu frame',()=>{
  let closed=0;const dialog=showModal({title:'Uji close',content:'<button>Tombol</button>',onClose(){closed++;}});dialog.close();assert(!dialog.isConnected,'Modal tertutup masih berada pada DOM');assert(closed===1,'onClose tidak langsung dijalankan');
 });
 it('pencarian cepat menunggu satu query dan tidak menampilkan hasil kata lama',async()=>{
  let finish;const waiting=new Promise(resolve=>{finish=resolve;});let calls=0;const controller=new AbortController();const dialog=openQuickSearch({projects:{list(){calls++;return waiting;}},tasks:{list:async()=>({items:[]})},signal:controller.signal});
  const input=dialog.querySelector('input');input.value='portal';input.dispatchEvent(new Event('input'));input.value='';input.dispatchEvent(new Event('input'));
  finish({items:[{id:'p',name:'Portal Lama',code:'NIRI-AAAAAA'}]});for(let i=0;i<10;i++)await Promise.resolve();assert(!dialog.textContent.includes('Portal Lama'),'Respons lama menimpa input kosong');assert(calls===1);dialog.close();controller.abort();
 });
 it('router tetap mendengarkan hashchange sesudah stop diikuti refresh',async()=>{
  const {Router}=await import('../js/core/router.js');const seen=[];const previous=location.hash;
  const router=new Router(route=>{seen.push(route.page);return()=>{};},()=>({user:{id:'u'}}));
  try{router.start();router.stop();await router.refresh();location.hash='#/team';window.dispatchEvent(new HashChangeEvent('hashchange'));assert(seen.includes('team'),'hashchange tidak terpasang kembali');}
  finally{router.stop();history.replaceState(null,'',previous||'#');}
 });
 it('deep link dipertahankan saat sesi memulihkan pengguna',async()=>{
  const {Router}=await import('../js/core/router.js');const seen=[];const previous=location.hash;let currentUser=null;
  history.replaceState(null,'','#/projects/proyek_123');
  const router=new Router(route=>{seen.push({page:route.page,id:route.params.id});return()=>{};},()=>({user:currentUser}));
  try{await router.refresh();assert(location.hash==='#/login');currentUser={id:'u'};await router.refresh();assert(location.hash==='#/projects/proyek_123');assert(seen.at(-1).id==='proyek_123');}
  finally{router.stop();history.replaceState(null,'',previous||'#');}
 });
 it('demo-session tetap berfungsi saat sessionStorage diblokir',async()=>{
  const {createDemoSession}=await import('../js/core/demo-session.js');
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const session=createDemoSession({storage:blocked});session.enter({id:'demo-admin',name:'Demo'});assert(session.user()?.id==='demo-admin');session.exit();assert(!session.user());
 });
 it('form tugas menonaktifkan simpan dan memberi petunjuk jika belum ada proyek',async()=>{
  const {openTaskForm}=await import('../js/components/task-form.js');const c=new AbortController();
  const dialog=await openTaskForm({projects:{list:async()=>({items:[]})},tasks:{},repository:{listProfiles:async()=>[]},user:{id:'u',role:'member'},signal:c.signal});
  assert(dialog.querySelector('[type=submit]').disabled,'Simpan harus nonaktif saat tidak ada proyek');assert(dialog.querySelector('[data-form-error]').textContent.includes('proyek'));c.abort();
 });
 it('task baru mengirim posisi kecil yang valid setelah form dimuat',async()=>{
  const {openTaskForm}=await import('../js/components/task-form.js');let sent;const p={id:'p',name:'Proyek',ownerId:'owner',memberIds:['owner']};const c=new AbortController();
  const d=await openTaskForm({projects:{list:async()=>({items:[p]})},tasks:{create:async input=>{sent=input;}},repository:{listProfiles:async()=>[]},user:{id:'owner',role:'member'},signal:c.signal});d.querySelector('[name=title]').value='Tugas baru';d.querySelector('form').requestSubmit();for(let i=0;i<10;i++)await Promise.resolve();assert(sent&&sent.position<1000000,'Posisi berbasis milidetik melebihi batas validasi');c.abort();
 });
 it('menghapus anggota kedua tidak secara diam-diam mengembalikan keanggotaan lama',async()=>{
  let sent;const project={id:'p',name:'Proyek tim',description:'',ownerId:'owner',memberIds:['owner','member'],status:'active',priority:'medium',startDate:'2026-11-01',dueDate:'2026-12-01',updatedAt:'v1'};
  const controller=new AbortController(),dialog=await openProjectForm({project,user:{id:'owner',name:'Pemilik'},projects:{update:async(_id,data)=>{sent=data;}},repository:{listProfiles:async()=>[{id:'owner',name:'Pemilik'},{id:'member',name:'Anggota'}]},signal:controller.signal});
  dialog.querySelector('[value=member]').checked=false;dialog.querySelector('form').requestSubmit();for(let i=0;i<10;i++)await Promise.resolve();assert(JSON.stringify(sent.memberIds)==='["owner"]');controller.abort();
 });
 it('admin bukan anggota tetap dapat membuat tugas pada proyek',async()=>{
  const {openTaskForm}=await import('../js/components/task-form.js');
  const project={id:'p',name:'Proyek anggota lain',ownerId:'a',memberIds:['a']};
  const controller=new AbortController(),dialog=await openTaskForm({projects:{list:async()=>({items:[project]})},tasks:{},repository:{listProfiles:async()=>[{id:'a',name:'Ayu'}]},user:{id:'admin',name:'Admin',role:'admin'},signal:controller.signal});
  assert(dialog.querySelector('[name=projectId]').value==='p','Proyek tidak tersedia bagi admin');dialog.close();controller.abort();
 });
 it('edit proyek pemilik saja tidak dihapus ketika profil gagal dimuat',async()=>{
  let sent;const project={id:'p',name:'Proyek tunggal',description:'',ownerId:'owner',memberIds:['owner'],status:'active',priority:'medium',startDate:'2026-11-01',dueDate:'2026-12-01',updatedAt:'v1'};
  const controller=new AbortController(),dialog=await openProjectForm({project,user:{id:'owner',name:'Pemilik'},projects:{update:async(_id,data)=>{sent=data;}},repository:{listProfiles:async()=>[{id:'owner',name:'Pemilik'}]},signal:controller.signal});
  dialog.querySelector('form').requestSubmit();for(let i=0;i<10;i++)await Promise.resolve();assert(sent.memberIds.includes('owner')&&sent.memberIds.length===1,'Keanggotaan pemilik tidak dikirim dengan benar');controller.abort();
 });
 it('edit proyek tetap menyimpan pemilik ketika daftar anggota berisi pemilik saja',async()=>{
  let sent;const project={id:'p',name:'Proyek tunggal',description:'',ownerId:'owner',memberIds:['owner'],status:'active',priority:'medium',startDate:'2026-11-01',dueDate:'2026-12-01',updatedAt:'v1'};
  const controller=new AbortController(),dialog=await openProjectForm({project,user:{id:'owner',name:'Pemilik'},projects:{update:async(_id,data)=>{sent=data;}},repository:{listProfiles:async()=>[{id:'owner',name:'Pemilik'}]},signal:controller.signal});
  dialog.querySelector('[name=name]').value='Nama baru';dialog.querySelector('form').requestSubmit();for(let i=0;i<10;i++)await Promise.resolve();assert(JSON.stringify(sent.memberIds)==='["owner"]');controller.abort();
 });
 it('listener tugas pada detail proyek berhenti ketika akses proyek ditolak',async()=>{
  let failProject,taskListeners=0;const controller=new AbortController(),host=document.createElement('div');document.body.append(host);
  const user={id:'owner',name:'Pemilik',role:'member'};
  const project={id:'p',name:'Proyek uji',ownerId:'owner',memberIds:['owner'],status:'active',priority:'medium',startDate:'2026-11-01',dueDate:'2026-12-01',taskTotal:0,taskDone:0};
  const projects={watchOne(_id,next,fail){failProject=fail;next({item:project});return()=>{};},canEdit:()=>true,canDelete:()=>true,list:async()=>({items:[project]})};
  const off=renderProjectDetail(host,{id:'p',projects,repository:{listProfiles:async()=>[]},user,signal:controller.signal,setConnection(){},tasks:{watch(){taskListeners++;return()=>{taskListeners--;};}}});
  try{assert(taskListeners===1);failProject({code:'permission-denied'});assert(taskListeners===0,'Listener tugas tetap membaca setelah izin proyek hilang');}finally{controller.abort();off();host.remove();}
 });
 it('sesi demo bertahan melalui refresh tanpa menyentuh Auth',async()=>{
  const map=new Map();const store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  const demo=createDemoSession({storage:store});demo.enter({id:'demo-admin',name:'Admin Demo',role:'admin'});const restored=createDemoSession({storage:store});assert(restored.user()?.id==='demo-admin');restored.exit();assert(!createDemoSession({storage:store}).user());
 });
 let passed=0;const failures=[];for(const test of tests){try{await test.run();passed++;}catch(e){failures.push({name:test.name,message:e.message});}}
 return{passed,total:tests.length,failed:failures.length,failures};
}
const output=document.querySelector('#correction-result');if(output)runCorrectionTests().then(result=>{window.__correctionResults=result;output.textContent=JSON.stringify(result,null,2);}).catch(e=>{window.__correctionResults={failed:1,error:e.message};output.textContent=`GAGAL: ${e.message}`;});
