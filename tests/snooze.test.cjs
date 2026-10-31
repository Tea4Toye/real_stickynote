const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createNote,snoozeNote,wakeNote,isSnoozed,completeNote,nextOccurrence,restoreNote,burnNotes,dayKey}=require('../src/shared/domain.cjs');
const now=new Date(2026,9,30,23,55);

test('snooze has a precise deadline and preserves partially completed work',()=>{
  const original=createNote({text:'Release checklist',items:[{text:'Build',done:true},{text:'Test',done:false}],appBinding:{name:'editor'},floating:false},now);
  original.focus={endAt:now.getTime()+60000,durationMinutes:15,notified:false};
  const before=JSON.stringify(original),sleeping=snoozeNote(original,15,now);
  assert.equal(sleeping.snoozedUntil,new Date(now.getTime()+900000).toISOString());
  assert.equal(sleeping.floating,true);assert.deepEqual(sleeping.items,original.items);assert.deepEqual(sleeping.appBinding,original.appBinding);assert.deepEqual(sleeping.focus,original.focus);assert.equal(JSON.stringify(original),before);
  assert.equal(isSnoozed(sleeping,now),true);assert.equal(isSnoozed(sleeping,new Date(now.getTime()+900000)),false);
});
test('early wake restores floating without completing the note',()=>{
  const n=snoozeNote(createNote({text:'A reminder'},now),30,now),w=wakeNote(n,now);
  assert.equal(w.snoozedUntil,null);assert.equal(w.snoozeWakeDate,dayKey(now));assert.equal(w.floating,true);assert.equal(w.status,'active');assert.equal(isSnoozed(w,now),false);
});
test('snooze rejects invalid durations and inactive notes',()=>{
  const n=createNote({text:'A reminder'},now);
  for(const m of [0,-1,1441,NaN,Infinity,'15'])assert.throws(()=>snoozeNote(n,m,now));
  assert.throws(()=>snoozeNote({...n,status:'done'},15,now));assert.throws(()=>wakeNote({...n,status:'ashes'},now));
});
test('old note files without snooze fields remain compatible',()=>{
  const n=createNote({text:'Old note'},now);delete n.snoozedUntil;delete n.snoozeWakeDate;
  assert.equal(isSnoozed(n,now),false);assert.equal(isSnoozed({...n,snoozedUntil:'invalid'},now),false);assert.equal(isSnoozed(null,now),false);
});
test('completion, revive, and recurrence never carry a snooze to another note lifecycle',()=>{
  const n=snoozeNote(createNote({text:'Daily habit',repeat:'daily'},now),60,now);
  const done=completeNote(n,now),next=nextOccurrence(done,now),restored=restoreNote(done,now);
  for(const result of [done,next,restored]){assert.equal(result.snoozedUntil,null);assert.equal(result.snoozeWakeDate,null);}
});
test('overnight snoozes survive daily burn and get the wake day to complete',()=>{
  const n=snoozeNote(createNote({text:'Tomorrow reminder'},now),15,now);
  const nextDay=new Date(2026,9,31,0,15),later=new Date(2026,10,1,0,15);
  assert.equal(burnNotes([n],nextDay)[0].status,'active');
  const w=wakeNote(n,nextDay);assert.equal(burnNotes([w],nextDay)[0].status,'active');
  assert.equal(burnNotes([w],later)[0].status,'ashes');
});
