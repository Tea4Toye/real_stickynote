const fs = require('node:fs');
const path = require('node:path');
const {createNote, BOARDS, COLORS} = require('../shared/domain.cjs');

const defaults = () => ({
  version: 1, notes: [], links: [], wraps: {},
  settings: {
    dailyBurn: false, sound: true, effect: 'crush', hideAll: false,
    protectCapture: false, autoPrivacy: false, ghostOpacity: 0.65,
    linkCatcher: false, launchAtLogin: false, tuckAppNotes: true,
    morningTime: '08:00', eveningTime: '18:00', dailyPrompts: false,
  },
});

function validate(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.notes) || !Array.isArray(data.links) || !data.wraps || typeof data.wraps !== 'object' || Array.isArray(data.wraps)) throw new Error('This is not a Real Sticky Note backup.');
  if (data.notes.length > 20000 || data.links.length > 50000) throw new Error('Backup is too large.');
  const ids = new Set();
  for (const n of data.notes) {
    if (!n || typeof n.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(n.id) || ids.has(n.id) || typeof n.text !== 'string' || n.text.length > 10000 || !['active','done','ashes'].includes(n.status) || !Array.isArray(n.items) || n.items.length > 100 || !Number.isFinite(Date.parse(n.createdAt))) throw new Error('Backup contains an invalid note.');
    ids.add(n.id);
    if (n.items.some(i => !i || typeof i.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(i.id) || typeof i.text !== 'string' || i.text.length > 500 || typeof i.done !== 'boolean') || new Set(n.items.map(i=>i.id)).size!==n.items.length) throw new Error('Backup contains an invalid checklist.');
    createNote(n);
    if(n.snoozedUntil!=null&&(typeof n.snoozedUntil!=='string'||!Number.isFinite(Date.parse(n.snoozedUntil))))throw new Error('Backup contains an invalid snooze deadline.');
    if(n.snoozeWakeDate!=null&&(typeof n.snoozeWakeDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(n.snoozeWakeDate)))throw new Error('Backup contains an invalid wake date.');
    if(!BOARDS.includes(n.board)||!COLORS.includes(n.color))throw new Error('Backup contains an unknown board or paper color.');
    if (n.appBinding && (typeof n.appBinding.name !== 'string' || n.appBinding.name.length > 260)) throw new Error('Backup contains an invalid app binding.');
    if (n.bounds && !['x','y','width','height'].every(k=>Number.isFinite(n.bounds[k]))) throw new Error('Backup contains invalid window bounds.');
  }
  for (const l of data.links) if (!l || typeof l.url !== 'string' || typeof l.id !== 'string' || typeof l.createdAt !== 'string') throw new Error('Backup contains an invalid link.');
  const settings = defaults().settings;
  for (const [key, value] of Object.entries(settings)) {
    if (typeof data.settings?.[key] === typeof value) settings[key] = data.settings[key];
  }
  if (!['crush','toss','shred','ash'].includes(settings.effect)) settings.effect = 'crush';
  settings.ghostOpacity = Math.max(0.25, Math.min(0.95, settings.ghostOpacity));
  for(const key of ['morningTime','eveningTime'])if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings[key]))settings[key]=defaults().settings[key];
  return {version:1, notes:data.notes, links:data.links, wraps:data.wraps, settings};
}

class Store {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, 'notes.json');
    this.warning = null;
    this.state = defaults();
    if (fs.existsSync(this.file)) {
      try { this.state = validate(JSON.parse(fs.readFileSync(this.file, 'utf8'))); }
      catch {
        const recovery = `${this.file}.corrupt-${Date.now()}`;
        fs.copyFileSync(this.file, recovery);
        try {
          this.state = validate(JSON.parse(fs.readFileSync(`${this.file}.bak`, 'utf8')));
          this.warning = 'Recovered your notes from the last backup. The damaged file has been kept.';
        } catch {
          // Never silently overwrite an unreadable store with an empty state.
          throw new Error(`Could not read your notes or backup. Your files are preserved at ${directory}. Restore notes.json from a valid backup before restarting.`);
        }
      }
    }
    this.lastSaved = JSON.stringify(this.state);
  }
  save() {
    try {
    const temporary = `${this.file}.tmp`;
    const payload = JSON.stringify(this.state, null, 2);
    fs.writeFileSync(temporary, payload, { encoding: 'utf8', flush: true });
    if (fs.existsSync(this.file)) {
      try { validate(JSON.parse(fs.readFileSync(this.file, 'utf8'))); fs.copyFileSync(this.file, `${this.file}.bak`); } catch { /* Keep the known-good backup. */ }
    }
    fs.renameSync(temporary, this.file);
    this.lastSaved = JSON.stringify(this.state);
    } catch (error) {
      this.state = JSON.parse(this.lastSaved);
      throw new Error(`Could not save your notes. Your last saved data is intact. Check disk space and folder access. ${error.code || ''}`);
    }
  }
}
module.exports = { Store, defaults, validate };
