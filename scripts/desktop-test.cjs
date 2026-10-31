const { _electron:electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'real-sticky-desktop-'));
const results=path.resolve('test-results');fs.mkdirSync(results,{recursive:true});
const errors=[];
let app;
async function launch(){
  const env={...process.env,STICKY_TEST:'1',STICKY_DATA_DIR:directory};delete env.ELECTRON_RUN_AS_NODE;
  const executablePath=process.env.STICKY_EXECUTABLE;
  app=await electron.launch({...(executablePath?{executablePath:path.resolve(executablePath),args:[]}:{args:[path.resolve('.')]}),env,timeout:30000});
  app.on('window',page=>page.on('pageerror',error=>errors.push(error.message)));
  return pageFor('board');
}
async function pageFor(view){
  await expect.poll(()=>app.windows().find(p=>p.url().includes('view='+view)),{timeout:15000}).toBeTruthy();
  const page=app.windows().find(p=>p.url().includes('view='+view));await page.waitForSelector('h1');return page;
}
async function snapshot(page){return page.evaluate(()=>window.sticky.snapshot());}
async function action(page,type,payload){const result=await page.evaluate(([t,p])=>window.sticky.action(t,p),[type,payload]);assert.equal(result.ok,true,result.error);return result.value;}

(async()=>{
  try{
    let board=await launch();await expect(board.getByRole('heading',{name:'Your day, on paper.'})).toBeVisible();
    await board.getByRole('button',{name:'Stick',exact:true}).click();
    await board.getByRole('textbox',{name:'Note text',exact:true}).fill('Ship the Windows app');
    await board.getByLabel('Checklist', {exact:true}).check();
    await board.getByRole('textbox',{name:'Checklist items, one per line'}).fill('Build the product\nTest persistence\nPackage for Windows');
    await board.getByRole('button',{name:'mint paper'}).click();
    await board.getByRole('button',{name:'Stick note',exact:true}).click();
    let note=await pageFor('note');await expect(note.getByRole('heading',{name:'Ship the Windows app'})).toBeVisible();
    await note.getByLabel('Build the product',{exact:true}).check();
    let data=await snapshot(board);const id=data.notes[0].id;
    assert.equal(data.notes[0].items[0].done,true);assert.equal(data.notes[0].status,'active');
    const rejected=await board.evaluate(id=>window.sticky.action('complete',{id}),id);assert.equal(rejected.ok,false);assert.match(rejected.error,/unfinished/);
    const native=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=note'));return {top:w.isAlwaysOnTop(),visible:w.isVisible(),bounds:w.getBounds()};});
    assert.equal(native.top,true);assert.equal(native.visible,true);
    await board.screenshot({path:path.join(results,'board.png')});await note.screenshot({path:path.join(results,'floating-checklist.png')});
    await app.close();
    board=await launch();note=await pageFor('note');
    await expect(note.getByLabel('Build the product',{exact:true})).toBeChecked();
    data=await snapshot(board);assert.equal(data.notes[0].id,id);
    await action(board,'ghost',{id});
    await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=note')).getOpacity())).toBeLessThan(0.9);
    await action(board,'ghost',{id});
    await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=note')).getOpacity())).toBe(1);
    await note.getByLabel('Test persistence',{exact:true}).check();
    await note.getByLabel('Package for Windows',{exact:true}).check();
    await expect.poll(async()=> (await snapshot(board)).notes.find(n=>n.id===id).status).toBe('done');
    await board.getByRole('button',{name:'Crushed',exact:true}).click();await expect(board.getByRole('button',{name:'Revive'})).toBeVisible();
    await board.getByRole('button',{name:'Revive'}).click();
    await expect.poll(async()=> (await snapshot(board)).notes.find(n=>n.id===id).status).toBe('active');
    await action(board,'focus',{id,minutes:1});data=await snapshot(board);assert.equal(data.notes.find(n=>n.id===id).focus.durationMinutes,1);
    await action(board,'stopFocus',{id});
    await action(board,'page',{view:'wrap'});const wrap=await pageFor('wrap');
    await wrap.getByLabel('Your journal').fill('A Windows app that stays in sight.');await wrap.getByLabel('Win of the day').fill('Persistent checklists work.');
    await wrap.getByLabel("Tomorrow's one thing").fill('Refine the paper UI');
    await wrap.getByRole('button',{name:'Save card'}).click();
    await expect.poll(()=>fs.existsSync(path.join(directory,'daily-wrap.png'))).toBe(true);
    assert.equal(fs.readFileSync(path.join(directory,'daily-wrap.png')).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    await wrap.screenshot({path:path.join(results,'daily-wrap.png')});
    await action(board,'page',{view:'links'});const links=await pageFor('links');
    await links.getByRole('textbox',{name:'Link URL'}).fill('https://example.com/read?utm_source=test&topic=notes');await links.getByRole('button',{name:'Save',exact:true}).click();
    data=await snapshot(board);assert.equal(data.links[0].url,'https://example.com/read?topic=notes');
    await action(board,'export');assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'export.json'))).notes.length,1);
    await action(board,'page',{view:'settings'});const settings=await pageFor('settings');
    await expect(settings.getByLabel('Daily Burn at midnight')).not.toBeChecked();await settings.screenshot({path:path.join(results,'settings.png')});
    await action(board,'hide');
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=note')).isVisible()),true);
    assert.equal((await snapshot(board)).runtime.observerError,null);
    assert.deepEqual(errors,[]);
    await app.close();app=null;
    const saved=JSON.parse(fs.readFileSync(path.join(directory,'notes.json'),'utf8'));
    assert.ok(Object.values(saved.wraps).some(w=>w.journal==='A Windows app that stays in sight.'));
    console.log(JSON.stringify({status:'passed',directory,screenshots:results,checks:['checklist UI','always on top','partial completion guard','relaunch persistence','ghost opacity and release','automatic completion','restore','focus timer','journal autosave','PNG card','saved links','backup export','safe defaults','tray persistence','no renderer exceptions']},null,2));
  }catch(error){console.error(error);console.error('Renderer errors:',errors);process.exitCode=1;}
  finally{if(app)await app.close();}
})();
