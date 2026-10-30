const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, screen, shell, dialog, clipboard, Notification, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Store, validate } = require('./store.cjs');
const domain = require('../shared/domain.cjs');
const { observeWindows } = require('./windows.cjs');
const { applyNativeState } = require('./note-presentation.cjs');

const testMode = process.env.STICKY_TEST === '1';
if (process.env.STICKY_DATA_DIR) app.setPath('userData', path.resolve(process.env.STICKY_DATA_DIR));
app.setAppUserModelId('com.realstickynote.desktop');
let store, tray, observer, quitting = false;
let external = null, nativeState = { alt:false, microphone:false }, observerError = null;
let lastClipboard = '', lastSchedule = '', lastBurnCheck=0, readingClipboard=false, undo = [];
const windows = new Map(), noteWindows = new Map(), closingNotes = new Set();
const shortcuts = {};
const uiFile = path.join(__dirname, '../renderer/index.html');
const iconFile = path.join(__dirname, '../../assets/icon.png');

function snapshot() {
  return { ...store.state, runtime: { foreground: external, observerError, shortcuts, dataPath:app.getPath('userData'), warning:store.warning, microphone:nativeState.microphone } };
}
function broadcast() {
  const data = snapshot();
  const globalProtection=Boolean(store.state.settings.protectCapture || (store.state.settings.autoPrivacy&&nativeState.microphone));
  const containsPrivate=store.state.notes.some(n=>n.private||n.ghost);
  for(const win of windows.values())if(!win.isDestroyed())applyNativeState(win,{protection:globalProtection||containsPrivate});
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('state', data);
}
function persist() { store.save(); syncNotes(); refreshTray(); broadcast(); }
function remember() { undo.push(JSON.stringify(store.state.notes)); if (undo.length > 30) undo.shift(); }
function findNote(id) { const n = store.state.notes.find(n=>n.id === id); if (!n) throw new Error('This note no longer exists.'); return n; }
function notify(title, body, click) {
  if (!testMode && Notification.isSupported()) { const notification = new Notification({title,body,icon:iconFile}); if (click) notification.on('click',click); notification.show(); }
}
function safeBounds(saved, width=330, height=310) {
  const fallback = screen.getPrimaryDisplay().workArea;
  const candidate = saved && ['x','y','width','height'].every(k=>Number.isFinite(saved[k])) ? saved : {x:fallback.x+fallback.width-width-40,y:fallback.y+80,width,height};
  const area = screen.getDisplayMatching(candidate).workArea;
  const w = Math.min(area.width, Math.max(290, Math.round(candidate.width)));
  const h = Math.min(area.height, Math.max(210, Math.round(candidate.height)));
  return {x:Math.max(area.x,Math.min(area.x+area.width-w,Math.round(candidate.x))),y:Math.max(area.y,Math.min(area.y+area.height-h,Math.round(candidate.y))),width:w,height:h};
}
function createWindow(view, options={}) {
  const win = new BrowserWindow({
    width:500,height:740,minWidth:390,minHeight:500,show:false,frame:false,
    backgroundColor:'#f0f1ef',autoHideMenuBar:true,icon:iconFile,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}, ...options,
  });
  win.setMenu(null);
  if(store){const n=options.noteId?store.state.notes.find(n=>n.id===options.noteId):null;win.setContentProtection(Boolean(store.state.settings.protectCapture||(store.state.settings.autoPrivacy&&nativeState.microphone)||(n?(n.private||n.ghost):store.state.notes.some(n=>n.private||n.ghost))));}
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  win.loadFile(uiFile,{query:{view,...(options.noteId ? {id:options.noteId}: {})}});
  return win;
}
function showPage(view='board', command) {
  let win = windows.get(view);
  if (!win || win.isDestroyed()) {
    win = createWindow(view, view==='settings' ? {width:540,height:780}:{});
    windows.set(view,win);
    win.on('close',event=>{ if (!quitting) {event.preventDefault();win.hide();} });
    win.once('ready-to-show',()=>{win.show(); if(command) win.webContents.send('command',command);});
  } else {
    if(win.isMinimized()) win.restore(); win.show();win.focus();
    if(command) win.webContents.send('command',command);
  }
  return win;
}
function toggleBoard() { const win=windows.get('board'); if(win?.isVisible()) win.hide(); else showPage(); }
function changeWindowGeometry(win, change) {
  clearTimeout(win.geometryTimer);
  win.programmaticMove=true;
  change();
  win.geometryTimer=setTimeout(()=>{if(!win.isDestroyed())win.programmaticMove=false;},400);
}
function applyNoteWindow(win,n) {
  const settings=store.state.settings;
  const snoozed=domain.isSnoozed(n);
  const ghost = Boolean(n.ghost && !nativeState.alt && !snoozed);
  applyNativeState(win,{
    protection:Boolean(n.private || n.ghost || settings.protectCapture || (settings.autoPrivacy && nativeState.microphone)),
    ignoreMouse:ghost,opacity:ghost?settings.ghostOpacity:1,topmost:!snoozed,lowered:snoozed,
  },window=>observer?.lowerWindow(window.getNativeWindowHandle()));
  let visible = !settings.hideAll;
  if(n.appBinding&&!snoozed) visible = visible && external?.name?.toLowerCase() === n.appBinding.name.toLowerCase();
  if(visible && !win.isVisible()) win.showInactive();
  if(!visible && win.isVisible()) win.hide();
}
function syncNotes() {
  for(const n of store.state.notes) {
    if(n.status!=='active' || !n.floating) continue;
    let win=noteWindows.get(n.id);
    if(!win || win.isDestroyed()) {
      const offset = noteWindows.size*26;
      const bounds = safeBounds(n.bounds || { ...safeBounds(null), x:screen.getPrimaryDisplay().workArea.x+65+offset, y:screen.getPrimaryDisplay().workArea.y+100+offset });
      win=createWindow('note',{...bounds,minWidth:290,minHeight:44,skipTaskbar:true,alwaysOnTop:true,noteId:n.id,transparent:true,backgroundColor:'#00000000'});
      win.fullWidth=bounds.width;
      win.fullHeight=bounds.height;
      win.setAlwaysOnTop(true,'screen-saver');
      win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
      noteWindows.set(n.id,win);
      win.once('ready-to-show',()=>{ if(!win.isDestroyed()) applyNoteWindow(win,findNote(n.id)); });
      let boundsTimer;
      const saveBounds=(resized=false)=>{if(win.programmaticMove)return;clearTimeout(boundsTimer);boundsTimer=setTimeout(()=>{if(win.isDestroyed()||win.programmaticMove)return;const current=findNote(n.id);const actual=win.getBounds();if(resized&&!win.tucked){win.fullWidth=Math.max(290,actual.width);win.fullHeight=Math.max(210,actual.height);}current.bounds={...actual,width:win.fullWidth,height:win.fullHeight};if(current.appBinding && external)current.appBinding.offset={x:actual.x-external.x,y:actual.y-external.y};store.save();},300);};
      win.on('moved',()=>saveBounds(false));win.on('resized',()=>saveBounds(true));
      win.on('will-resize',()=>{clearTimeout(win.geometryTimer);win.programmaticMove=false;});
      win.on('closed',()=>{clearTimeout(boundsTimer);clearTimeout(win.geometryTimer);noteWindows.delete(n.id);});
      win.on('close',event=>{if(!quitting && findNote(n.id).status==='active' && findNote(n.id).floating){event.preventDefault();showPage();}});
    }
    applyNoteWindow(win,n);
  }
  for(const [id,win] of noteWindows) {
    const n=store.state.notes.find(n=>n.id===id);
    if(!n || n.status!=='active' || !n.floating) {
      if(closingNotes.has(id))continue;
      closingNotes.add(id);
      win.webContents.send('command',{type:'finish',effect:n?.status==='ashes'?'ash':store.state.settings.effect,sound:store.state.settings.sound});
      setTimeout(()=>{closingNotes.delete(id);const current=store.state.notes.find(n=>n.id===id);if(current?.status==='active'&&current.floating)return;if(!win.isDestroyed())win.destroy();},650);
    }
  }
}
function refreshTray() {
  if(!tray)return;
  const count=store.state.notes.filter(n=>n.status==='active').length;
  tray.setToolTip(`Real Sticky Note · ${count} unfinished`);
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Open board',click:()=>showPage()},
    {label:'Stick a note',accelerator:'Ctrl+Shift+T',click:()=>showPage('board',{type:'new'})},
    {type:'separator'},
    {label:'Daily Wrap',click:()=>showPage('wrap')},{label:'Saved links',click:()=>showPage('links')},
    {label:'Hide all notes',type:'checkbox',checked:store.state.settings.hideAll,click:()=>{store.state.settings.hideAll=!store.state.settings.hideAll;persist();}},
    {label:'Hide notes from screen capture',type:'checkbox',checked:store.state.settings.protectCapture,click:()=>{store.state.settings.protectCapture=!store.state.settings.protectCapture;persist();}},
    {label:'Release all ghost notes',click:releaseGhosts},
    {label:'Settings',click:()=>showPage('settings')}, {type:'separator'},
    {label:'Quit Real Sticky Note',click:()=>{quitting=true;app.quit();}},
  ]));
}
function releaseGhosts(){for(const n of store.state.notes)n.ghost=false;persist();}
function finish(n) {
  const completed=domain.completeNote(n);
  Object.assign(n,completed);
  const next=domain.nextOccurrence(n);
  if(next)store.state.notes.unshift(next);
}
async function captureLink(){
  if(readingClipboard||!store.state.settings.linkCatcher)return;
  readingClipboard=true;
  try{
    const items=await clipboard.read();
    const concealed=items.some(item=>item.types.some(format=>/ExcludeClipboardContentFromMonitorProcessing|concealed|password|keepass|1password|bitwarden/i.test(format)));
    if(concealed)return;
    const item=items.find(item=>item.types.includes('text/plain'));
    if(!item)return;
    const blob=await item.getType('text/plain');
    if(blob.size>4096)return;
    const text=await blob.text();
    if(!store.state.settings.linkCatcher||text===lastClipboard)return;
    lastClipboard=text;
    const url=domain.cleanUrl(text);
    if(url&&!store.state.links.some(l=>l.url===url)){
      const title=new URL(url).hostname;
      store.state.links.unshift({id:randomUUID(),url,title,createdAt:new Date().toISOString()});
      store.state.notes.unshift(domain.createNote({text:url,board:'Reading',floating:false}));persist();
    }
  }catch(error){console.error('Link Catcher could not read the clipboard:',error.message);}
  finally{readingClipboard=false;}
}
function runMaintenance() {
  let changed=false;
  if(store.state.settings.dailyBurn && Date.now()-lastBurnCheck>30000){lastBurnCheck=Date.now();const notes=domain.burnNotes(store.state.notes);if(JSON.stringify(notes)!==JSON.stringify(store.state.notes)){store.state.notes=notes;changed=true;}}
  const now=Date.now();
  for(const n of store.state.notes)if(n.status==='active'&&n.snoozedUntil&&Date.parse(n.snoozedUntil)<=now){
    Object.assign(n,domain.wakeNote(n));
    notify('Your snoozed note is back',n.text.slice(0,100),()=>{noteWindows.get(n.id)?.show();});changed=true;
  }
  for(const n of store.state.notes) if(n.status==='active' && n.focus && !n.focus.notified && n.focus.endAt<=now){
    n.focus.notified=true;
    const key=domain.dayKey(); const wrap=store.state.wraps[key] ||= {};
    wrap.focusMinutes=(wrap.focusMinutes||0)+n.focus.durationMinutes;
    notify('Focus session finished',n.text.slice(0,100),()=>{noteWindows.get(n.id)?.show();});changed=true;
  }
  if(changed)persist();
  if(store.state.settings.dailyPrompts){
    const date=new Date();const key=`${domain.dayKey()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    if(lastSchedule!==key){lastSchedule=key; const time=key.slice(-5);if(time===store.state.settings.morningTime)showPage();if(time===store.state.settings.eveningTime)showPage('wrap');}
  }
  if(store.state.settings.linkCatcher)captureLink();
}

async function action(type,payload,win) {
  const data=payload && typeof payload==='object' ? payload : {};
  switch(type){
    case 'create': {remember();const note=domain.createNote(data);if(data.bindApp&&external)note.appBinding={name:external.name,offset:null};store.state.notes.unshift(note);persist();return note.id;}
    case 'update': {
      const n=findNote(data.id);if(n.status!=='active')throw new Error('Revive this note before editing.');remember();
      const input={...n,...data};const clean=domain.createNote(input);
      for(const key of ['text','items','board','color','dueDate','repeat','private','ghost','floating'])n[key]=clean[key];
      n.updatedAt=new Date().toISOString();if(n.items.length&&domain.canComplete(n))finish(n);persist();return n.id;
    }
    case 'check': {const n=findNote(data.id);if(n.status!=='active')return;remember();const item=n.items.find(i=>i.id===data.itemId);if(!item)throw new Error('Checklist item not found.');item.done=Boolean(data.done);n.updatedAt=new Date().toISOString();if(domain.canComplete(n))finish(n);persist();return;}
    case 'complete': {const n=findNote(data.id);if(n.status!=='active')return;remember();finish(n);persist();return;}
    case 'archive': {const n=findNote(data.id);remember();n.status='ashes';n.burnedAt=new Date().toISOString();n.focus=null;persist();return;}
    case 'restore': {const n=findNote(data.id);remember();Object.assign(n,domain.restoreNote(n));persist();return;}
    case 'undo': {const previous=undo.pop();if(previous){store.state.notes=JSON.parse(previous);persist();}return;}
    case 'float': {const n=findNote(data.id);n.floating=data.value!==false;if(n.floating&&n.snoozedUntil)Object.assign(n,domain.wakeNote(n));persist();if(n.floating)noteWindows.get(n.id)?.focus();return;}
    case 'snooze': {const n=findNote(data.id);remember();Object.assign(n,domain.snoozeNote(n,Number(data.minutes)));persist();return n.snoozedUntil;}
    case 'wake': {const n=findNote(data.id);Object.assign(n,domain.wakeNote(n));persist();return;}
    case 'releaseGhosts': {releaseGhosts();return;}
    case 'private': {const n=findNote(data.id);n.private=!n.private;persist();return;}
    case 'ghost': {const n=findNote(data.id);n.ghost=!n.ghost;persist();return;}
    case 'bind': {const n=findNote(data.id);if(data.clear)n.appBinding=null;else{if(!external)throw new Error('Switch to the app you want, then reopen the board.');n.appBinding={name:external.name,offset:null};}persist();return;}
    case 'tuck': {const n=findNote(data.id);const noteWin=noteWindows.get(n.id);if(!noteWin)return;const tucked=Boolean(data.value&&n.appBinding&&store.state.settings.tuckAppNotes&&!domain.isSnoozed(n));if(noteWin.tucked===tucked)return;noteWin.tucked=tucked;changeWindowGeometry(noteWin,()=>noteWin.setSize(noteWin.fullWidth,tucked?44:noteWin.fullHeight));return;}
    case 'focus': {const n=findNote(data.id);const minutes=Number(data.minutes);if(!Number.isFinite(minutes)||minutes<1||minutes>180)throw new Error('Choose 1 to 180 minutes.');n.focus={endAt:Date.now()+minutes*60000,durationMinutes:minutes,notified:false};persist();return;}
    case 'stopFocus': {findNote(data.id).focus=null;persist();return;}
    case 'settings': {
      const merged=validate({...store.state,settings:{...store.state.settings,...data}}).settings;
      const catcherJustEnabled=merged.linkCatcher&&!store.state.settings.linkCatcher;
      if(catcherJustEnabled)lastClipboard=await clipboard.readText();
      store.state.settings=merged;
      lastBurnCheck=0;
      if(!testMode && process.platform==='win32')app.setLoginItemSettings({openAtLogin:merged.launchAtLogin,path:app.getPath('exe')});
      persist();return;
    }
    case 'wrap': {if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date))throw new Error('Choose a valid date.');const existing=store.state.wraps[data.date]||{};for(const key of ['journal','win','tomorrow','mood'])if(typeof data[key]==='string')existing[key]=data[key].slice(0,20000);store.state.wraps[data.date]=existing;persist();return;}
    case 'tomorrow': {const text=String(data.text||'').trim();if(!text)throw new Error('Write tomorrow\u2019s one thing first.');const date=new Date();date.setDate(date.getDate()+1);store.state.notes.unshift(domain.createNote({text,board:'Focus',dueDate:domain.dayKey(date)}));persist();return;}
    case 'open': {const url=domain.cleanUrl(data.url);if(!url)throw new Error('This link is not a safe public web URL.');await shell.openExternal(url);return;}
    case 'copy': {await clipboard.writeText(String(data.text||'').slice(0,20000));return;}
    case 'saveLink': {const url=domain.cleanUrl(data.url);if(!url)throw new Error('Enter a single public http or https link without credentials or secret parameters.');if(!store.state.links.some(l=>l.url===url))store.state.links.unshift({id:randomUUID(),url,title:new URL(url).hostname,createdAt:new Date().toISOString()});persist();return;}
    case 'page': {if(!['board','settings','wrap','links'].includes(data.view))throw new Error('Unknown page.');showPage(data.view,data.command);return;}
    case 'hide': {win.hide();return;}
    case 'minimize': {win.minimize();return;}
    case 'dataFolder': {await shell.openPath(app.getPath('userData'));return;}
    case 'export': {
      const target=testMode?{filePath:path.join(app.getPath('userData'),'export.json')}:await dialog.showSaveDialog(win,{defaultPath:'Real Sticky Note backup.json',filters:[{name:'JSON backup',extensions:['json']}]});
      if(target.filePath){fs.writeFileSync(target.filePath,JSON.stringify(store.state,null,2));return target.filePath;}return null;
    }
    case 'import': {
      const picked=await dialog.showOpenDialog(win,{filters:[{name:'JSON backup',extensions:['json']}],properties:['openFile']});if(picked.canceled)return;
      const file=picked.filePaths[0];if(fs.statSync(file).size>25*1024*1024)throw new Error('Backup exceeds 25 MB.');
      const imported=validate(JSON.parse(fs.readFileSync(file,'utf8')));remember();
      const ids=new Set(store.state.notes.map(n=>n.id));for(const n of imported.notes)if(!ids.has(n.id))store.state.notes.push(n);
      const urls=new Set(store.state.links.map(l=>l.url));for(const l of imported.links)if(!urls.has(l.url))store.state.links.push(l);
      store.state.wraps={...imported.wraps,...store.state.wraps};persist();return;
    }
    case 'saveCard': {
      if(typeof data.png!=='string'||!data.png.startsWith('data:image/png;base64,')||data.png.length>12000000)throw new Error('Could not create the image.');
      const buffer=Buffer.from(data.png.slice(22),'base64');if(buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Invalid PNG.');
      const target=testMode?{filePath:path.join(app.getPath('userData'),'daily-wrap.png')}:await dialog.showSaveDialog(win,{defaultPath:`Daily Wrap ${domain.dayKey()}.png`,filters:[{name:'PNG image',extensions:['png']}]});
      if(target.filePath){fs.writeFileSync(target.filePath,buffer);return target.filePath;}return null;
    }
    default:throw new Error('Unknown action.');
  }
}
function commandUrl(raw){
  try{const url=new URL(raw);if(url.protocol!=='realsticky:')return;const text=url.searchParams.get('text')||'';
    if(url.hostname==='add'){store.state.notes.unshift(domain.createNote({text,board:url.searchParams.get('board')}));persist();}
    if(url.hostname==='plan')showPage();if(url.hostname==='wrap')showPage('wrap');
    if(url.hostname==='privacy'){store.state.settings.protectCapture=url.searchParams.get('on')==='1';persist();}
    if(['crush','focus'].includes(url.hostname)){if(!text)throw new Error('A text query is required.');const n=store.state.notes.find(n=>n.status==='active'&&n.text.toLowerCase().includes(text.toLowerCase()));if(n){if(url.hostname==='crush'){remember();finish(n);persist();}else action('focus',{id:n.id,minutes:Number(url.searchParams.get('minutes')||25)}).catch(e=>notify('Could not start focus',e.message));}}
  }catch(e){notify('Could not run note command',e.message);}
}

if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',(_event,args)=>{const url=args.find(a=>a.startsWith('realsticky://'));if(url&&store)commandUrl(url);else showPage();});
  app.on('open-url',(event,url)=>{event.preventDefault();if(store)commandUrl(url);});
  app.whenReady().then(()=>{
    store=new Store(app.getPath('userData'));
    if(!testMode){if(app.isPackaged)app.setAsDefaultProtocolClient('realsticky');else app.setAsDefaultProtocolClient('realsticky',process.execPath,[path.resolve(process.argv[1])]);}
    ipcMain.handle('snapshot',event=>{if(!BrowserWindow.fromWebContents(event.sender))throw new Error('Unknown window.');return snapshot();});
    ipcMain.handle('action',async(event,type,payload)=>{try{const win=BrowserWindow.fromWebContents(event.sender);if(!win)throw new Error('Unknown window.');return {ok:true,value:await action(type,payload,win)};}catch(error){broadcast();return{ok:false,error:error.message};}});
    if(fs.existsSync(iconFile)){tray=new Tray(nativeImage.createFromPath(iconFile).resize({width:20,height:20}));tray.on('click',toggleBoard);refreshTray();}
    for(const [key,callback]of [['Control+Shift+T',()=>showPage('board',{type:'new'})],['Control+Shift+Space',toggleBoard],['Control+Alt+G',releaseGhosts]])shortcuts[key]=globalShortcut.register(key,callback);
    observer=observeWindows(raw=>{
      const origin=screen.screenToDipPoint({x:Math.round(raw.x),y:Math.round(raw.y)});
      const corner=screen.screenToDipPoint({x:Math.round(raw.x+raw.width),y:Math.round(raw.y+raw.height)});
      const update={...raw,...origin,width:corner.x-origin.x,height:corner.y-origin.y};
      const changed=nativeState.microphone!==update.microphone;
      nativeState=update;
      if(update.pid!==process.pid && update.name && !['powershell','pwsh','explorer'].includes(update.name.toLowerCase()))external=update;
      for(const n of store.state.notes){const win=noteWindows.get(n.id);if(!win||win.isDestroyed()||n.status!=='active')continue;
        // Own note/editor windows retain the previous app so editing doesn't hide the note.
        const own=update.pid===process.pid;
        const active=own?external:update;
        if(n.appBinding && !domain.isSnoozed(n) && active?.name?.toLowerCase()===n.appBinding.name.toLowerCase() && !own){
          const offset=n.appBinding.offset || {x:active.width-win.getBounds().width-14,y:42};
          const bounds=safeBounds({...win.getBounds(),x:active.x+offset.x,y:active.y+offset.y});
          if(win.getBounds().x!==bounds.x||win.getBounds().y!==bounds.y)changeWindowGeometry(win,()=>win.setPosition(bounds.x,bounds.y));
        }
        if(n.appBinding&&!domain.isSnoozed(n)&&!own&&active?.name?.toLowerCase()!==n.appBinding.name.toLowerCase())win.hide();else applyNoteWindow(win,n);
      }
      if(changed)broadcast();
    },message=>{observerError=message;broadcast();});
    runMaintenance();syncNotes();
    const startUrl=process.argv.find(a=>a.startsWith('realsticky://'));if(startUrl)commandUrl(startUrl);
    if(!app.getLoginItemSettings().wasOpenedAtLogin || testMode)showPage();
    setInterval(runMaintenance,1000).unref();
    powerMonitor.on('resume',()=>{runMaintenance();syncNotes();});
    screen.on('display-removed',()=>{for(const win of noteWindows.values())win.setBounds(safeBounds(win.getBounds()));});
  }).catch(error=>{dialog.showErrorBox('Real Sticky Note could not start',error.message);quitting=true;app.quit();});
}
app.on('window-all-closed',()=>{});
app.on('before-quit',()=>{quitting=true;observer?.stop();globalShortcut.unregisterAll();tray?.destroy();});
