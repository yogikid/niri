import { isFirebaseConfigured } from './core/firebase-config.js';
import { initializeFavicon } from './core/favicon.js';
import { initializeFirebase } from './core/firebase.js';
import { SessionStore } from './core/auth.js';
import { Router, matchRoute } from './core/router.js';
import { escapeHTML as esc, translateError } from './core/utils.js';
import { Repository } from './data/repository.js';
import { FirestoreAdapter } from './data/firestore-adapter.js';
import { LocalAdapter } from './data/local-adapter.js';
import { AuthService } from './services/auth-service.js';
import { ProjectService } from './services/project-service.js';
import { TaskService } from './services/task-service.js';
import { CommentService } from './services/comment-service.js';
import { TeamService } from './services/team-service.js';
import { DataService } from './services/data-service.js';
import { openQuickSearch } from './components/quick-search.js';
import { createDemoSession } from './core/demo-session.js';
import { openTaskDetail } from './components/task-detail.js';
import { brand, confirmAction, emptyState, icon, toast, showModal } from './components/ui.js';
import { renderShell, updateConnection } from './components/shell.js';
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderProjects } from './pages/projects.js';
import { renderProjectDetail } from './pages/project-detail.js';
import { renderTasks } from './pages/tasks.js';
import { renderTeam } from './pages/team.js';
import { renderActivity } from './pages/activity.js';
import { renderSettings } from './pages/settings.js';

const root = document.querySelector('#app');
const store = new SessionStore();
const firebaseStore = new SessionStore();
const demoSession = createDemoSession();
const DEMO_USER = Object.freeze({id:'demo-admin',name:'Admin Demo',email:'admin@niri.demo',role:'admin'});
const configured = isFirebaseConfigured();
let repository = null;
let authService = null;
let projects = null;
let tasks = null;
let comments = null;
let team = null;
let dataService = null;
let lastUser = null;
let connection = { fromCache: true, pending: false };
let router;
let appMode = 'firebase';

let demoRepository = null;
let demoProjects = null;
let demoTasks = null;
let demoComments = null;
let demoTeam = null;
let demoDataService = null;
let demoRevision = 0;
let routeSignal = null;
let firebaseStatus = 'idle';
let initializing = null;
let sessionUnsubscribe;

function loading() {
  root.innerHTML = `<main class="loading-screen" role="status">${brand()}<p>Menyiapkan ruang kerja…</p><span class="mono">NiRi / SILAKAN TUNGGU</span></main>`;
}

function startupError(error) {
  root.innerHTML = `<main class="loading-screen">${brand()}<section class="window"><div class="window-body stack"><h1>Belum terhubung.</h1><p>${esc(translateError(error))}</p><button class="btn btn-dark" type="button" id="startup-retry">Coba kembali${icon('arrow')}</button><a href="./tests/index.html">Buka pengujian lokal</a></div></section></main>`;
  root.querySelector('#startup-retry').addEventListener('click', () => location.reload());
}

function searchWorkspace() {
  if (!store.get().user || !routeSignal || document.querySelector('dialog[open]')) return;
  openQuickSearch({projects:appMode==='demo'?demoProjects:projects,tasks:appMode==='demo'?demoTasks:tasks,signal:routeSignal,onNavigate:path=>router.go(path)});
}

async function enterDemoMode({restore=false}={}) {
  try {
    store.set({ready:false});
    if (!demoRepository) {
      demoRepository = new Repository(new LocalAdapter({key:'niri:demo-data'}));
      await demoRepository.createProfile(DEMO_USER.id,{name:DEMO_USER.name,email:DEMO_USER.email,role:'admin',isPlaceholder:false,avatarColor:getComputedStyle(document.documentElement).getPropertyValue('--pink-primary').trim()});
      const existing=await demoRepository.listProjects({user:DEMO_USER,pageSize:1});
      if(!existing.items.length){
        const response=await fetch(new URL('../data/seed.json',import.meta.url));if(!response.ok)throw Error('Seed tidak dapat dimuat');
        await demoRepository.seedDemo(await response.json(),DEMO_USER);
      }
      const currentDemoUser=()=>appMode==='demo'?store.get().user:null;
      const revision=()=>demoRevision;
      demoProjects=new ProjectService(demoRepository,currentDemoUser,revision);demoTasks=new TaskService(demoRepository,currentDemoUser,revision);
      demoComments=new CommentService(demoRepository,currentDemoUser,revision);demoTeam=new TeamService(demoRepository,currentDemoUser,revision);demoDataService=new DataService(demoRepository,currentDemoUser,revision);
    }
    demoSession.enter(DEMO_USER);appMode='demo';++demoRevision;
    store.set({user:DEMO_USER,ready:true,authUser:null,error:null,mode:'demo'});
    if(!restore){toast('Mode Demo Lokal aktif. Tidak tersinkron ke Firebase.');router.go('/dashboard');}
  }catch(error){
    demoSession.exit();appMode='firebase';demoRepository=null;
    toast(`Demo belum dapat dibuka. ${translateError(error)}`,'error');
    store.set({...firebaseStore.get(),user:null,ready:true,mode:'firebase'});
  }
}

async function logout(signal) {
  if (appMode === 'demo') {
    demoSession.exit(); ++demoRevision; appMode = 'firebase';
    const next=firebaseStore.get();store.set({...next,ready:true,mode:'firebase'});
    toast('Keluar dari Mode Demo Lokal.');
    router.go(next.user?'/dashboard':'/login');
    return;
  }
  const confirmed = await confirmAction({
    title: 'Keluar dari NiRi?',
    message: 'Sesi akun akan diakhiri pada perangkat ini. Data yang sudah tersimpan di Firebase tetap tersedia saat Anda masuk kembali. Cache disk, jika aktif, tidak otomatis dihapus.',
    label: 'Ya, keluar',
    signal,
    symbol: 'logout',
    destructive: false,
  });
  if (!confirmed) return;
  try {
    await authService.logout();
    toast('Anda telah keluar dari NiRi.');
  } catch (error) {
    toast(translateError(error), 'error');
  }
}

async function renderRoute(route, signal) {
  routeSignal=signal;
  if (!store.get().ready) {
    loading();
    return () => {};
  }
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  if (route.page === 'login') {
    document.title = 'NiRi — Masuk ke ruang kerja';
    return renderLogin(root, {authService,store,configured:configured&&firebaseStatus==='ready',signal,onEnterDemo:()=>enterDemoMode(),connectionState:firebaseStatus,onRetryFirebase:connectFirebase});
  }
  const user = store.get().user;
  const currentRepo = appMode === 'demo' ? demoRepository : repository;
  if (!user || !currentRepo) return () => {};

  const main = renderShell(root, {
    user,
    page: route.page,
    signal,
    onLogout: () => logout(signal),
    onSearch: searchWorkspace,
    mode: appMode,
  });

  const setConnection = (data) => {
    if(signal.aborted)return;
    connection = { fromCache: data.fromCache, pending: data.pending };
    updateConnection(root, { ...connection, mode: appMode });
  };

  const pService = appMode === 'demo' ? demoProjects : projects;
  const tService = appMode === 'demo' ? demoTasks : tasks;
  const cService = appMode === 'demo' ? demoComments : comments;
  const tmService = appMode === 'demo' ? demoTeam : team;
  const dService = appMode === 'demo' ? demoDataService : dataService;

  const context = {
    repository: currentRepo,
    projects: pService,
    tasks: tService,
    comments: cService,
    team: tmService,
    dataService: dService,
    user,
    signal,
    setConnection,
    mode: appMode,
  };

  let dispose = () => {};
  if (route.page === 'dashboard') {
    document.title = 'NiRi — Dasbor';
    dispose = renderDashboard(main, context);
  } else if (route.page === 'projects') {
    document.title = 'NiRi — Proyek';
    dispose = renderProjects(main, context);
  } else if (route.page === 'project-detail') {
    document.title = 'NiRi — Detail proyek';
    dispose = renderProjectDetail(main, { ...context, id: route.params.id });
  } else if (route.page === 'tasks') {
    document.title = 'NiRi — Papan Tugas';
    dispose = renderTasks(main, context);
  } else if (route.page === 'team') {
    document.title = 'NiRi — Anggota Tim';
    dispose = renderTeam(main, context);
  } else if (route.page === 'activity') {
    document.title = 'NiRi — Aktivitas';
    dispose = renderActivity(main, context);
  } else if (route.page === 'settings') {
    document.title = 'NiRi — Pengaturan';
    dispose = renderSettings(main, { ...context, mode: appMode });
  } else {
    document.title = 'NiRi — Halaman tidak ditemukan';
    main.innerHTML = emptyState({
      title: 'Sepertinya salah belok.',
      description: 'Halaman ini belum tersedia atau alamatnya tidak tepat. Yuk, kembali ke rencana Anda.',
      symbol: 'search',
      action: '<a class="btn btn-dark" href="#/dashboard">Kembali ke dasbor</a>',
    });
  }
  updateConnection(root, { ...connection, mode: appMode });
  if(route.page==='tasks'){
    const taskId=new URLSearchParams(location.hash.split('?')[1]??'').get('task');
    if(taskId&&/^[A-Za-z0-9_-]{1,128}$/.test(taskId)){
      history.replaceState(null,'','#/tasks');
      openTaskDetail({...context,id:taskId});
    }
  }
  return dispose;
}

async function connectFirebase(){
  if(!configured||initializing||firebaseStatus==='ready')return;
  firebaseStatus='connecting';if(appMode==='firebase')router.refresh();
  initializing=(async()=>{
    try{
      const firebase=await initializeFirebase();
      repository=new Repository(new FirestoreAdapter(firebase.db,firebase.firestoreSDK));
      authService=new AuthService({gateway:firebase.gateway,repository,store:firebaseStore});
      const currentUser=()=>appMode==='firebase'&&firebaseStore.get().user?.id===firebase.gateway.current()?.uid?firebaseStore.get().user:null;
      const revision=()=>authService.revision;
      projects=new ProjectService(repository,currentUser,revision);tasks=new TaskService(repository,currentUser,revision);comments=new CommentService(repository,currentUser,revision);team=new TeamService(repository,currentUser,revision);dataService=new DataService(repository,currentUser,revision);
      firebaseStatus='ready';sessionUnsubscribe?.();sessionUnsubscribe=authService.start();
    }catch(error){
      firebaseStatus='error';firebaseStore.set({user:null,authUser:null,error,ready:true});
    }finally{initializing=null;if(appMode==='firebase'&&!store.get().user)router.refresh();}
  })();
  return initializing;
}

async function start(){
  initializeFavicon();
  if(location.protocol==='file:'){startupError({code:'unavailable'});return;}
  router=new Router(renderRoute,()=>store.get());let started=false;
  store.subscribe(state=>{
    if(!state.ready){if(started){router.stop();started=false;}loading();return;}
    if(state.user?.id!==lastUser){connection={fromCache:true,pending:false};lastUser=state.user?.id??null;}
    if(!started){router.start();started=true;}else router.refresh();
  });
  firebaseStore.subscribe(state=>{if(appMode==='firebase')store.set({...state,mode:'firebase'});});
  const restored=demoSession.user();
  if(restored){appMode='demo';await enterDemoMode({restore:true});}
  else{
    const initialPath=location.hash.replace(/^#/,'');
    if(initialPath&&initialPath!=='/login'&&matchRoute(location.hash).page!=='not-found')router.pendingPath=initialPath;
    store.set({ready:true,user:null,authUser:null,mode:'firebase'});
  }
  // NiRi: tampilkan demo/login sebelum mengunduh SDK, agar cadangan tetap dapat dibuka saat CDN gagal.
  connectFirebase();
  window.addEventListener('online',()=>updateConnection(root,{...connection,mode:appMode}));
  window.addEventListener('offline',()=>updateConnection(root,{...connection,mode:appMode}));
  document.addEventListener('keydown',event=>{
    if(event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('dialog[open]'))return;
    if(event.target.closest('input,textarea,select,[contenteditable=true]'))return;
    event.preventDefault();searchWorkspace();
  });
  document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();document.querySelector('#main-content')?.focus();});
}

start().catch(startupError);
