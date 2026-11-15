import { Repository } from '../js/data/repository.js';
import { LocalAdapter } from '../js/data/local-adapter.js';
import { ProjectService } from '../js/services/project-service.js';
import { TaskService } from '../js/services/task-service.js';
import { CommentService } from '../js/services/comment-service.js';
import { TeamService } from '../js/services/team-service.js';
import { DataService } from '../js/services/data-service.js';
import { SessionStore } from '../js/core/auth.js';
import { renderShell } from '../js/components/shell.js';
import { renderDashboard } from '../js/pages/dashboard.js';
import { renderProjects } from '../js/pages/projects.js';
import { renderProjectDetail } from '../js/pages/project-detail.js';
import { renderTasks } from '../js/pages/tasks.js';
import { renderTeam } from '../js/pages/team.js';
import { renderActivity } from '../js/pages/activity.js';
import { renderSettings } from '../js/pages/settings.js';
import { renderLogin } from '../js/pages/login.js';
import { openTaskForm } from '../js/components/task-form.js';
const data = new Map();
const repository = new Repository(new LocalAdapter({ storage: { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value) }, key:'responsive-isolated' }));
const user = { id:'responsive-admin', name:'Admin Pengujian', email:'uji@example.test', role:'admin' };
await repository.createProfile(user.id, { ...user, isPlaceholder:false });
await repository.seedDemo(await (await fetch('../data/seed.json')).json(), user);
const projects=new ProjectService(repository,()=>user), tasks=new TaskService(repository,()=>user), comments=new CommentService(repository,()=>user), team=new TeamService(repository,()=>user), dataService=new DataService(repository,()=>user);
const root=document.querySelector('#app'); let controller;let dispose=()=>{};
window.renderTestPage=async(page)=>{
 controller?.abort();dispose();controller=new AbortController();const signal=controller.signal;
 if(page==='login'){const store=new SessionStore();store.set({ready:true});dispose=renderLogin(root,{store,configured:false,authService:{},onEnterDemo(){},signal});}
 else {
 const main=renderShell(root,{user,page,signal,mode:'demo',onLogout(){},onSearch(){}});
 const context={repository,projects,tasks,comments,team,dataService,user,signal,mode:'demo',setConnection(){}};
 const renderers={dashboard:renderDashboard,projects:renderProjects,tasks:renderTasks,team:renderTeam,activity:renderActivity,settings:renderSettings};
 if(page==='project-detail'){const p=(await projects.list()).items[0];dispose=renderProjectDetail(main,{...context,id:p.id});}
 else dispose=renderers[page](main,context);
 }
 for(let i=0;i<25;i++)await Promise.resolve();
 document.documentElement.dataset.ready=page;
 return {page,width:innerWidth,scrollWidth:document.documentElement.scrollWidth};
};
window.fixtureContext={repository,projects,tasks,comments,team,dataService,user};
window.openFixtureTaskForm=()=>openTaskForm({repository,projects,tasks,user,signal:controller.signal});
window.testTruncatedDashboard=async()=>{
 const host=document.createElement('div');document.body.append(host);const abort=new AbortController();
 const off=renderDashboard(host,{projects:{list:async()=>({items:[],hasMore:true})},tasks:{list:async()=>({items:[],hasMore:true})},repository:{listActivity:async()=>({items:[{type:'task_created',message:'Ringkasan lama',actorId:user.id}]}),listProfiles:async()=>[user]},user,signal:abort.signal,setConnection(){}});
 for(let i=0;i<15;i++)await Promise.resolve();const text=host.textContent;abort.abort();off();host.remove();return{text};
};
await window.renderTestPage('dashboard');
window.parent.dispatchEvent(new Event('niri-fixture-ready'));
