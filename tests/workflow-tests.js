const cases=[];const it=(name,run)=>cases.push({name,run});const assert=(value,message='Pernyataan gagal')=>{if(!value)throw Error(message);};
async function suite(){
  const {renderTasks}=await import('../js/pages/tasks.js');
  const {renderTeam}=await import('../js/pages/team.js');
  const {LocalAdapter}=await import('../js/data/local-adapter.js');
  const {Repository}=await import('../js/data/repository.js');
  const {ProjectService}=await import('../js/services/project-service.js');
  const {TaskService}=await import('../js/services/task-service.js');
  const {TeamService}=await import('../js/services/team-service.js');
  const {CommentService}=await import('../js/services/comment-service.js');
  const user={id:'workflow-admin',name:'Admin Uji',email:'uji@example.test',role:'admin'};
  const memory=new Map();const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
  const repository=new Repository(new LocalAdapter({storage,key:'workflow'}));
  await repository.createProfile(user.id,{name:user.name,email:user.email,role:'admin',isPlaceholder:false,avatarColor:getComputedStyle(document.documentElement).getPropertyValue('--pink-primary').trim()});
  const projects=new ProjectService(repository,()=>user),tasks=new TaskService(repository,()=>user),team=new TeamService(repository,()=>user),comments=new CommentService(repository,()=>user);
  const project=await projects.create({name:'Proyek alur uji',description:'',memberIds:[user.id],status:'active',priority:'high',startDate:'2026-11-01',dueDate:'2026-12-31'});
  const task=await tasks.create({projectId:project.id,title:'Tugas alur uji',description:'<img src=x onerror=alert(1)>',assigneeId:user.id,status:'todo',priority:'high',dueDate:'2026-12-01',estimateHours:3,tags:['uji'],position:0});
  const context={repository,projects,tasks,team,comments,user,setConnection(){}};
  const previousView=localStorage.getItem('niri:tasks-view');localStorage.setItem('niri:tasks-view','kanban');
  it('papan tugas memuat empat kolom dan alternatif pindah tanpa drag',async()=>{const root=document.createElement('div');document.body.append(root);const abort=new AbortController();const off=renderTasks(root,{...context,signal:abort.signal});try{for(let i=0;i<8;i++)await Promise.resolve();assert(root.querySelectorAll('[data-kanban-status]').length===4);assert(root.textContent.includes(task.title));assert(root.querySelector('[data-move-task]'));assert(root.querySelectorAll('img').length===0);}finally{abort.abort();off?.();root.remove();}});
  it('halaman tim memuat role dan aksi admin',async()=>{const root=document.createElement('div');document.body.append(root);const abort=new AbortController();const off=renderTeam(root,{...context,signal:abort.signal});try{for(let i=0;i<12;i++)await Promise.resolve();assert(root.textContent.includes(user.name));assert(root.querySelector('[data-add-placeholder]'));}finally{abort.abort();off?.();root.remove();}});
  it('pemindahan done memperbarui counter dan completedAt',async()=>{await tasks.move(task.id,'done');const after=await tasks.get(task.id);const p=await projects.get(project.id);assert(after.status==='done'&&after.completedAt);assert(p.taskTotal===1&&p.taskDone===1);await tasks.move(task.id,'todo');assert((await projects.get(project.id)).taskDone===0);});
  it('komentar menerima teks berbahaya sebagai data biasa',async()=>{const c=await comments.add(task.id,'<script>alert(1)</script>');assert(c.body.includes('<script>'));await comments.remove(c.id);});
  let passed=0,failures=[];for(const test of cases){const li=document.createElement('li');try{await test.run();passed++;li.textContent=`LULUS — ${test.name}`;li.className='test-pass';}catch(e){li.textContent=`GAGAL — ${test.name}: ${e.message}`;li.className='test-fail';failures.push(li.textContent);}document.querySelector('#results').append(li);}if(previousView===null)localStorage.removeItem('niri:tasks-view');else localStorage.setItem('niri:tasks-view',previousView);window.__workflowResults={passed,total:cases.length,failed:failures.length,failures};document.querySelector('#result').textContent=`${passed}/${cases.length} lulus · ${failures.length} gagal`;
}
suite().catch(e=>{document.querySelector('#result').textContent=`GAGAL memuat implementasi: ${e.message}`;window.__workflowResults={passed:0,failed:1,error:e.message};});
