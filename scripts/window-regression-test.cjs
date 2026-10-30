const {_electron:electron,expect}=require('playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let app;
(async()=>{try{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sticky-window-reg-'));
 const env={...process.env,STICKY_TEST:'1',STICKY_DATA_DIR:directory};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.STICKY_EXECUTABLE;
 app=await electron.launch({...(executablePath?{executablePath:path.resolve(executablePath),args:[]}:{args:[process.cwd()]}),env});
 await expect.poll(()=>app.windows().find(p=>p.url().includes('view=board'))).toBeTruthy();
 const board=app.windows().find(p=>p.url().includes('view=board'));await board.waitForSelector('h1');
 async function action(type,payload){const r=await board.evaluate(([t,p])=>sticky.action(t,p),[type,payload]);assert.equal(r.ok,true,r.error);return r.value;}
 const id=await action('create',{text:'Pinning size regression',appBinding:{name:'test-target'},floating:true});
 await expect.poll(()=>app.windows().find(p=>p.url().includes('id='+id))).toBeTruthy();
 const note=app.windows().find(p=>p.url().includes('id='+id));await note.waitForSelector('#floating-paper');
 const dimensions=()=>app.evaluate(({BrowserWindow},id)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('id='+id));return {bounds:w.getBounds(),content:w.getContentBounds(),fullHeight:w.fullHeight};},id);
 const sizes=[];
 for(let i=0;i<20;i++){
  await action('tuck',{id,value:true});await action('tuck',{id,value:false});sizes.push(await dimensions());
 }
 console.log(JSON.stringify({first:sizes[0],last:sizes.at(-1),widths:sizes.map(s=>s.bounds.width),heights:sizes.map(s=>s.bounds.height)}));
 assert.ok(Math.max(...sizes.map(s=>s.bounds.width))-Math.min(...sizes.map(s=>s.bounds.width))<=2,'Native note width drifted over tuck cycles');
 assert.ok(Math.max(...sizes.map(s=>s.bounds.height))-Math.min(...sizes.map(s=>s.bounds.height))<=2,'Native note height drifted over tuck cycles');
 const slow=[];
 for(let i=0;i<4;i++){
  await action('tuck',{id,value:true});await note.waitForTimeout(450);
  await action('tuck',{id,value:false});await note.waitForTimeout(450);slow.push(await dimensions());
 }
 assert.ok(slow.every(s=>Math.abs(s.bounds.width-sizes[0].bounds.width)<=2&&Math.abs(s.bounds.height-sizes[0].bounds.height)<=2),'Delayed resize callbacks changed the expanded size');
 await action('bind',{id,clear:true});await expect.poll(async()=>(await dimensions()).bounds.height).toBeGreaterThanOrEqual(210);
 console.log('PASS: 20 rapid and 4 delayed native tuck/untuck cycles preserve width and height.');
}catch(error){console.error(error);process.exitCode=1;}finally{if(app)await app.close();}})();
