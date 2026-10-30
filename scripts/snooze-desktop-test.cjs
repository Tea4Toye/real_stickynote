const {_electron:electron,expect}=require('playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sticky-snooze-desktop-'));
let app;
const errors=[];
async function pageFor(view){await expect.poll(()=>app.windows().find(p=>p.url().includes('view='+view))).toBeTruthy();const page=app.windows().find(p=>p.url().includes('view='+view));await page.waitForSelector('h1');return page;}
async function launch(){
  const env={...process.env,STICKY_TEST:'1',STICKY_DATA_DIR:directory};delete env.ELECTRON_RUN_AS_NODE;
  const executablePath=process.env.STICKY_EXECUTABLE;
  app=await electron.launch({...(executablePath?{executablePath:path.resolve(executablePath),args:[]}:{args:[process.cwd()]}),env});
  app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
  return pageFor('board');
}
async function state(page){return page.evaluate(()=>sticky.snapshot());}
async function action(page,type,payload={}){const r=await page.evaluate(([t,p])=>sticky.action(t,p),[type,payload]);assert.equal(r.ok,true,r.error);return r.value;}
async function topmost(id){return app.evaluate(({BrowserWindow},id)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('id='+id))?.isAlwaysOnTop(),id);}

(async()=>{try{
  let board=await launch();
  await board.getByRole('button',{name:'Stick',exact:true}).click();
  await board.getByRole('textbox',{name:'Note text',exact:true}).fill('Finish the report after lunch');
  await board.getByLabel('Checklist',{exact:true}).check();
  await board.getByRole('textbox',{name:'Checklist items, one per line'}).fill('Review the draft\nSend the email');
  await board.getByRole('button',{name:'Stick note',exact:true}).click();
  let note=await pageFor('note');let s=await state(board);const id=s.notes[0].id;
  await note.getByLabel('Review the draft',{exact:true}).check();
  await note.getByLabel('Focus duration').selectOption('15');
  await note.getByLabel('Snooze duration').selectOption('5');
  await expect.poll(()=>topmost(id)).toBe(false);
  s=await state(board);assert.ok(Date.parse(s.notes[0].snoozedUntil)>Date.now());assert.equal(s.notes[0].focus.durationMinutes,15);assert.equal(s.notes[0].items[0].done,true);
  fs.mkdirSync('test-results',{recursive:true});await board.screenshot({path:'test-results/snooze-board.png'});await note.screenshot({path:'test-results/snoozed-note.png'});
  await board.getByRole('button',{name:/Snoozed until.*Wake now/}).click();await expect.poll(()=>topmost(id)).toBe(true);
  await note.getByLabel('Snooze duration').selectOption('15');await expect.poll(()=>topmost(id)).toBe(false);
  await app.close();app=null;
  const savedFile=path.join(directory,'notes.json');const saved=JSON.parse(fs.readFileSync(savedFile,'utf8'));
  assert.ok(saved.notes[0].snoozedUntil);assert.equal(saved.notes[0].items[0].done,true);
  // A short deterministic deadline exercises the same production expiry path.
  saved.notes[0].snoozedUntil=new Date(Date.now()+8000).toISOString();fs.writeFileSync(savedFile,JSON.stringify(saved));
  board=await launch();note=await pageFor('note');await expect.poll(()=>topmost(id)).toBe(false);
  await expect(note.getByLabel('Review the draft',{exact:true})).toBeChecked();
  await expect.poll(()=>topmost(id),{timeout:12000}).toBe(true);
  await expect.poll(async()=>(await state(board)).notes[0].snoozedUntil).toBe(null);
  await note.getByRole('button',{name:'Ghost mode: hold Alt to interact',exact:true}).click();
  await expect(board.locator('.ghost-recovery')).toBeVisible();
  await board.locator('.ghost-recovery').getByRole('button',{name:'Exit ghost mode',exact:true}).click();
  await expect.poll(async()=>(await state(board)).notes[0].ghost).toBe(false);
  await note.evaluate(()=>document.querySelector('#floating-paper').dataset.identity='stable-note');
  await action(board,'settings',{protectCapture:true});await action(board,'settings',{protectCapture:false});
  await expect(note.locator('#floating-paper')).toHaveAttribute('data-identity','stable-note');
  const calls=await app.evaluate(async({BrowserWindow},id)=>{
    const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('id='+id));let ignores=0,opacity=0;
    const originalIgnore=w.setIgnoreMouseEvents.bind(w),originalOpacity=w.setOpacity.bind(w);
    w.setIgnoreMouseEvents=(...args)=>{ignores++;return originalIgnore(...args);};w.setOpacity=(...args)=>{opacity++;return originalOpacity(...args);};
    await new Promise(resolve=>setTimeout(resolve,1200));return{ignores,opacity};
  },id);
  assert.deepEqual(calls,{ignores:0,opacity:0});
  s=await state(board);assert.equal(s.runtime.observerError,null);assert.deepEqual(errors,[]);
  await app.close();app=null;
  console.log(JSON.stringify({status:'passed',directory,checks:['snooze UI and native topmost off','partial checklist and focus preserved','board Wake now','snooze survives restart','real scheduled expiry restores topmost','visible ghost exit','irrelevant state keeps note DOM intact','no redundant native mouse or opacity updates','helper startup','no renderer exceptions']},null,2));
}catch(error){console.error(error);console.error({rendererErrors:errors});process.exitCode=1;}finally{if(app)await app.close();}})();
