const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyNativeState}=require('../src/main/note-presentation.cjs');

function fakeWindow(){
  const calls=[];const win={calls};
  for(const method of ['setContentProtection','setIgnoreMouseEvents','setOpacity','setAlwaysOnTop','moveTop','moveBottom'])win[method]=(...args)=>calls.push([method,...args]);
  return win;
}
test('unchanged desktop observations never reapply native styles during a drag',()=>{
  const win=fakeWindow();const normal={protection:false,ignoreMouse:false,opacity:1,topmost:true,lowered:false};
  applyNativeState(win,normal);const initial=win.calls.length;
  for(let i=0;i<100;i++)applyNativeState(win,normal);
  assert.equal(win.calls.length,initial);
});
test('Alt interaction only changes the click-through and opacity states once',()=>{
  const win=fakeWindow();const ghost={protection:true,ignoreMouse:true,opacity:0.65,topmost:true,lowered:false};
  applyNativeState(win,ghost);win.calls.length=0;
  for(let i=0;i<20;i++)applyNativeState(win,{...ghost,ignoreMouse:false,opacity:1});
  assert.deepEqual(win.calls.map(c=>c[0]),['setIgnoreMouseEvents','setOpacity']);
});
test('snooze lowers once, wake restores topmost once, and never steals focus',()=>{
  const win=fakeWindow();applyNativeState(win,{topmost:true,lowered:false});win.calls.length=0;
  for(let i=0;i<20;i++)applyNativeState(win,{topmost:false,lowered:true},()=>win.calls.push(['lowerWindow']));
  assert.deepEqual(win.calls.map(c=>c[0]),['setAlwaysOnTop','lowerWindow']);win.calls.length=0;
  applyNativeState(win,{topmost:true,lowered:false});applyNativeState(win,{topmost:true,lowered:false});
  assert.deepEqual(win.calls.map(c=>c[0]),['setAlwaysOnTop','moveTop']);
});
