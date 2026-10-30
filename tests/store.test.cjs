const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, validate, defaults } = require('../src/main/store.cjs');

test('durable save preserves notes and creates a previous-version backup', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sticky-store-'));
  const store=new Store(dir);store.save();store.state.wraps['2026-10-30']={journal:'Keep this'};store.save();
  assert.equal(new Store(dir).state.wraps['2026-10-30'].journal,'Keep this');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'notes.json.bak'),'utf8')).wraps,{});
});
test('damaged primary recovers backup and retains damaged bytes for recovery', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sticky-recovery-'));
  const store=new Store(dir);store.state.wraps.today={journal:'valuable'};store.save();store.save();
  fs.writeFileSync(store.file,'BROKEN');const recovered=new Store(dir);
  assert.equal(recovered.state.wraps.today.journal,'valuable');assert.match(recovered.warning,/Recovered/);
  assert.ok(fs.readdirSync(dir).some(name=>name.includes('.corrupt-')));
  recovered.save();assert.equal(JSON.parse(fs.readFileSync(`${store.file}.bak`,'utf8')).wraps.today.journal,'valuable');
});
test('unrecoverable data refuses to start instead of overwriting notes', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sticky-fail-safe-'));
  fs.writeFileSync(path.join(dir,'notes.json'),'KEEP DAMAGED BYTES');
  assert.throws(()=>new Store(dir),/preserved/);
  assert.equal(fs.readFileSync(path.join(dir,'notes.json'),'utf8'),'KEEP DAMAGED BYTES');
});
test('backup validation rejects malformed note state and duplicate ids', () => {
  assert.throws(()=>validate({version:2,notes:[],links:[],wraps:{}}),/not a Real/);
  assert.throws(()=>validate({...defaults(),notes:[{id:'oops'}]}),/invalid note/);
});
test('settings reject wrong types and clamp opacity', () => {
  const data=validate({...defaults(),settings:{dailyBurn:'yes',ghostOpacity:2,effect:'javascript'}});
  assert.equal(data.settings.dailyBurn,false);assert.equal(data.settings.ghostOpacity,0.95);assert.equal(data.settings.effect,'crush');
});
test('failed writes roll memory back to the last saved state and preserve the file', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sticky-write-failure-'));
  const store=new Store(dir);store.save();const original=fs.readFileSync(store.file,'utf8');
  fs.mkdirSync(`${store.file}.tmp`);store.state.wraps.today={journal:'Uncommitted change'};
  assert.throws(()=>store.save(),/last saved data is intact/);
  assert.equal(store.state.wraps.today,undefined);assert.equal(fs.readFileSync(store.file,'utf8'),original);
});
