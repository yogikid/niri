const frame=document.querySelector('#fixture');
const summary=document.querySelector('#summary');
const report=document.querySelector('#report');
const failures=[];let passed=0;const rows=[];
const assert=(condition,message)=>{if(!condition)throw Error(message);};
async function ready(){
 if(frame.contentDocument?.documentElement?.dataset.ready)return;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture belum siap dalam 15 detik')),15000);const listener=()=>{if(frame.contentDocument?.documentElement?.dataset.ready){clearTimeout(timer);window.removeEventListener('niri-fixture-ready',listener);resolve();}};window.addEventListener('niri-fixture-ready',listener);listener();});
}
async function check(name,run){try{await run();passed++;rows.push({name,passed:true});}catch(e){const row={name,passed:false,message:e.message};failures.push(row);rows.push(row);}}
try{
 await ready();
 for(const width of [360,768,1280]){
  frame.style.width=`${width}px`;
  const saved=localStorage.getItem('niri:tasks-view');localStorage.setItem('niri:tasks-view','kanban');
  for(const page of ['dashboard','projects','project-detail','tasks','team','activity','settings','login']){
   await check(`${page} pada ${width}px tidak meluber horizontal`,async()=>{
    await frame.contentWindow.renderTestPage(page);
    const doc=frame.contentDocument;
    assert(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1,`${doc.documentElement.scrollWidth}px > ${doc.documentElement.clientWidth}px`);
   });
  }
  await check(`Tabel tugas pada ${width}px tidak meluber`,async()=>{
   const win=frame.contentWindow;await win.renderTestPage('tasks');const doc=frame.contentDocument;doc.querySelector('[data-view="table"]').click();
   assert(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1,`${doc.documentElement.scrollWidth}px > ${doc.documentElement.clientWidth}px`);
   doc.querySelector('[data-view="kanban"]').click();
  });
  await check(`Modal tugas pada ${width}px dapat digulir dan tidak meluber`,async()=>{
   const win=frame.contentWindow;await win.renderTestPage('tasks');
   // NiRi: panggil di realm iframe agar dialog memakai viewport yang diuji.
   const dialog=await win.openFixtureTaskForm();
   const doc=frame.contentDocument;
   assert(dialog.open,'Dialog tidak terbuka');assert(dialog.scrollWidth<=dialog.clientWidth+1,'Isi dialog meluber');
   const r=dialog.getBoundingClientRect();assert(r.left>=0&&r.right<=doc.documentElement.clientWidth+1,'Dialog keluar viewport');
   dialog.close();
  });
  if(saved===null)localStorage.removeItem('niri:tasks-view');else localStorage.setItem('niri:tasks-view',saved);
 }
 await check('Sidebar desktop tetap dapat diakses pada layar pendek',async()=>{
  frame.style.width='1280px';frame.style.height='600px';await frame.contentWindow.renderTestPage('dashboard');const d=frame.contentDocument;const sidebar=d.querySelector('.sidebar');const profile=sidebar.querySelector('.profile');const overflow=sidebar.scrollHeight>sidebar.clientHeight;
  assert(!overflow||['auto','scroll'].includes(frame.contentWindow.getComputedStyle(sidebar).overflowY),'Bagian bawah sidebar keluar viewport tanpa bisa digulir');
  frame.style.height='900px';
 });
 await check('Aksi header mobile memiliki target sentuh sekurangnya 44px',async()=>{
  frame.style.width='360px';await frame.contentWindow.renderTestPage('dashboard');const d=frame.contentDocument;
  for(const button of d.querySelectorAll('.topbar button'))assert(button.getBoundingClientRect().height>=44,`Target sentuh ${button.textContent} terlalu pendek`);
 });
 await check('Tabel mobile menjadi kartu dan seluruh filter tetap dapat diakses',async()=>{
  frame.style.width='360px';await frame.contentWindow.renderTestPage('tasks');const d=frame.contentDocument;d.querySelector('[data-view="table"]').click();
  assert(frame.contentWindow.getComputedStyle(d.querySelector('.data-table tr')).display==='block','Tabel belum menjadi kartu');
  assert(d.querySelectorAll('.task-filters select').length===5,'Filter tugas tidak lengkap');
  assert(d.documentElement.scrollWidth<=d.documentElement.clientWidth+1,'Tabel kartu meluber');
  d.querySelector('[data-view="kanban"]').click();
 });
 await check('Menu mobile bisa ditutup dengan Escape dan mengembalikan fokus',async()=>{
  frame.style.width='360px';await frame.contentWindow.renderTestPage('dashboard');const d=frame.contentDocument;const more=d.querySelector('[data-more]');more.click();
  const menu=d.querySelector('[data-more-menu]');assert(!menu.hidden,'Menu tidak terbuka');menu.querySelector('a').focus();
  d.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert(menu.hidden,'Escape tidak menutup menu');assert(d.activeElement===more,'Fokus tidak kembali ke tombol Lainnya');
 });
 await check('Tautan aktivitas memiliki ringkasan terbaca, bukan undefined',async()=>{
  await frame.contentWindow.renderTestPage('activity');const d=frame.contentDocument;const entries=[...d.querySelectorAll('.activity-feed li p')];
  assert(entries.length>0,'Aktivitas seed hilang');assert(entries.every(p=>p.textContent.trim()&&p.textContent!=='undefined'),'Ringkasan aktivitas kosong');
 });
 await check('Legenda donat tidak bertumpuk dan label grafik berada dalam kanvas SVG',async()=>{
  frame.style.width='1280px';await frame.contentWindow.renderTestPage('dashboard');const d=frame.contentDocument;
  const legends=[...d.querySelectorAll('.chart-legend-item')].map(el=>el.getBoundingClientRect());
  assert(legends.length===4,'Legenda status tidak lengkap');
  for(let i=0;i<legends.length;i++)for(let j=i+1;j<legends.length;j++){const a=legends[i],b=legends[j];assert(!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top),'Legenda donat saling menimpa');}
  for(const svg of d.querySelectorAll('.dashboard-grid svg[role=img]')){const view=svg.viewBox.baseVal;for(const text of svg.querySelectorAll('text')){const b=text.getBBox();assert(b.x>=-1&&b.x+b.width<=view.width+1,`Label grafik terpotong: ${text.textContent}`);}}
 });
 await check('Dasbor memberi label ketika angka hanya mencakup hasil terbatas',async()=>{
  const win=frame.contentWindow;await win.renderTestPage('dashboard');
  const result=await win.testTruncatedDashboard();
  assert(result.text.includes('Data terbatas'),'KPI terlihat sebagai total global meski query terpotong');
  assert(!result.text.includes('undefined'),'Feed aktivitas dasbor kosong');
 });
 const result={passed,failed:failures.length,total:rows.length,failures,rows};window.__responsiveResults=result;
 summary.textContent=`${passed}/${rows.length} lulus · ${failures.length} gagal`;report.textContent=JSON.stringify(rows,null,2);
}catch(e){summary.textContent=`GAGAL: ${e.message}`;window.__responsiveResults={passed,failed:1,error:e.message};}
