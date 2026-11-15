// NiRi: hanya penanda mode demo, bukan sesi atau token autentikasi Firebase.
const KEY='niri:demo-session';
let memoryValue=null;
function defaultStorage(){try{return globalThis.sessionStorage;}catch{return null;}}
export function createDemoSession({storage=defaultStorage()}={}){
 return{
  enter(user){
   const payload=JSON.stringify({id:user.id,name:user.name,email:user.email??'',role:'admin'});memoryValue=payload;
   try{storage?.setItem(KEY,payload);}catch{/* NiRi: tetap lanjut di memori jika sessionStorage diblokir. */}
  },
  user(){
   let raw=memoryValue;try{raw=storage?.getItem(KEY)??memoryValue;}catch{raw=memoryValue;}
   try{const value=JSON.parse(raw??'null');return value?.id==='demo-admin'&&value.role==='admin'?value:null;}catch{return null;}
  },
  exit(){memoryValue=null;try{storage?.removeItem(KEY);}catch{/* NiRi: abaikan blokir penyimpanan. */}},
 };
}
