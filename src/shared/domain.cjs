'use strict';

const { randomUUID } = require('node:crypto');

const BOARDS = Object.freeze(['Focus', 'Work', 'Personal', 'Ideas', 'General', 'Reading']);
const COLORS = Object.freeze(['yellow', 'rose', 'orange', 'mint', 'blue', 'lavender']);
const REPEAT_VALUES = Object.freeze(['none', 'daily', 'weekly']);
const SENSITIVE_QUERY_NAMES = new Set([
  'token', 'key', 'api_key', 'password', 'secret', 'access_token', 'auth', 'code'
]);

function toValidDate(value, label = 'date') {
  if (value === null || value === undefined) {
    throw new TypeError(`Invalid ${label}: value must not be null or undefined`);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`Invalid ${label}`);
  }
  return d;
}

function dayKey(date = new Date()) {
  const d = toValidDate(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isPrivateOrLocalHost(hostname) {
  let host = hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host.endsWith('.lan') || host === '::1' ||
      host === '::' || host === '0.0.0.0') {
    return true;
  }
  if (host.includes(':') && /^(fc|fd|fe[89ab])/i.test(host)) return true;
  if (host.startsWith('::ffff:')) host = host.slice(7);

  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (match) {
    const [, a, b, c, d] = match.map(Number);
    if (a > 255 || b > 255 || c > 255 || d > 255) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
  }
  return false;
}

function cleanUrl(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > 4096 || /\s/.test(text)) {
    return null;
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    return null;
  }
  if (isPrivateOrLocalHost(url.hostname)) {
    return null;
  }

  const toDelete = [];
  for (const [key] of url.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (SENSITIVE_QUERY_NAMES.has(lower)) return null;
    if (lower.startsWith('utm_') || lower === 'fbclid' || lower === 'gclid' || lower === 'msclkid') {
      toDelete.push(key);
    }
  }

  const fragmentParams = new URLSearchParams(url.hash.slice(1).replace(/^.*\?/, ''));
  for (const [key] of fragmentParams) if (SENSITIVE_QUERY_NAMES.has(key.toLowerCase())) return null;
  for (const key of toDelete) url.searchParams.delete(key);
  const normalized = url.toString();
  return normalized.length <= 4096 ? normalized : null;
}

function parseDueDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Invalid dueDate: must be a string');
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Invalid dueDate format: expected YYYY-MM-DD');

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12) throw new Error('Invalid dueDate: month out of range');

  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    throw new Error('Invalid dueDate: day does not exist in calendar');
  }
  return value;
}

function createNote(input, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Note input must be an object');
  }
  const isoNow = toValidDate(now).toISOString();

  const items = [];
  if (Array.isArray(input.items)) {
    for (const rawItem of input.items) {
      if (typeof rawItem === 'string') {
        const itemText = rawItem.trim();
        if (itemText.length > 0) {
          if (itemText.length > 500) throw new Error('Checklist item text exceeds 500 characters');
          items.push({ id: randomUUID(), text: itemText, done: false });
        }
      } else if (rawItem && typeof rawItem === 'object') {
        const itemText = typeof rawItem.text === 'string' ? rawItem.text.trim() : '';
        if (itemText.length > 0) {
          if (itemText.length > 500) throw new Error('Checklist item text exceeds 500 characters');
          items.push({
            id: typeof rawItem.id === 'string' && rawItem.id ? rawItem.id : randomUUID(),
            text: itemText,
            done: Boolean(rawItem.done)
          });
        }
      }
    }
  }

  if (items.length > 100) throw new Error('Checklist items count exceeds 100');

  let text = typeof input.text === 'string' ? input.text.trim() : '';
  if (text.length > 10000) throw new Error('Note text exceeds 10000 characters');
  if (text.length === 0) {
    if (items.length > 0) text = 'Checklist';
    else throw new Error('Cannot create entirely blank note');
  }

  const board = typeof input.board === 'string' && BOARDS.includes(input.board) ? input.board : 'General';
  const color = typeof input.color === 'string' && COLORS.includes(input.color) ? input.color : 'yellow';
  const dueDate = parseDueDate(input.dueDate);

  let repeat = 'none';
  if (input.repeat !== undefined && input.repeat !== null && input.repeat !== '') {
    if (!REPEAT_VALUES.includes(input.repeat)) {
      throw new Error(`Invalid repeat value: must be one of ${REPEAT_VALUES.join(', ')}`);
    }
    repeat = input.repeat;
  }

  return {
    id: typeof input.id === 'string' && input.id ? input.id : randomUUID(),
    text,
    items,
    board,
    color,
    status: 'active',
    createdAt: isoNow,
    updatedAt: isoNow,
    completedAt: null,
    burnedAt: null,
    dueDate,
    repeat,
    floating: input.floating !== undefined ? Boolean(input.floating) : true,
    private: Boolean(input.private),
    ghost: Boolean(input.ghost),
    appBinding: input.appBinding && typeof input.appBinding === 'object' ? { ...input.appBinding } : null,
    bounds: input.bounds && typeof input.bounds === 'object' ? { ...input.bounds } : null,
    focus: null
  };
}

function canComplete(note) {
  if (!note || typeof note !== 'object') return false;
  if (!Array.isArray(note.items) || note.items.length === 0) return true;
  return note.items.every(item => Boolean(item && item.done));
}

function completeNote(note, now = new Date()) {
  if (!canComplete(note)) {
    throw new Error('Cannot complete note with unfinished checklist items');
  }
  const isoNow = toValidDate(now).toISOString();

  return {
    ...note,
    items: Array.isArray(note.items) ? note.items.map(item => ({ ...item })) : [],
    appBinding: note.appBinding ? { ...note.appBinding } : null,
    bounds: note.bounds ? { ...note.bounds } : null,
    status: 'done',
    completedAt: isoNow,
    updatedAt: isoNow,
    focus: null
  };
}

function nextOccurrence(note, now = new Date()) {
  if (!note || typeof note !== 'object') throw new TypeError('Note must be an object');
  if (!note.repeat || note.repeat === 'none') return null;
  if (note.repeat !== 'daily' && note.repeat !== 'weekly') {
    throw new Error("Invalid repeat value: must be 'daily' or 'weekly'");
  }

  const nowD = toValidDate(now);
  const todayKey = dayKey(nowD);
  const isoNow = nowD.toISOString();

  let anchorDateStr = note.dueDate;
  if (!anchorDateStr) {
    anchorDateStr = note.completedAt ? dayKey(new Date(note.completedAt)) : todayKey;
  }

  const [y, m, d] = anchorDateStr.split('-').map(Number);
  const current = new Date(y, m - 1, d);
  const stepDays = note.repeat === 'daily' ? 1 : 7;

  do {
    current.setDate(current.getDate() + stepDays);
  } while (dayKey(current) <= todayKey);

  return {
    id: randomUUID(),
    text: note.text,
    items: Array.isArray(note.items) ? note.items.map(item => ({ id: randomUUID(), text: item.text, done: false })) : [],
    board: note.board,
    color: note.color,
    status: 'active',
    createdAt: isoNow,
    updatedAt: isoNow,
    completedAt: null,
    burnedAt: null,
    dueDate: dayKey(current),
    repeat: note.repeat,
    floating: note.floating !== undefined ? Boolean(note.floating) : true,
    private: Boolean(note.private),
    ghost: Boolean(note.ghost),
    appBinding: note.appBinding ? { ...note.appBinding } : null,
    bounds: note.bounds ? { ...note.bounds } : null,
    focus: null
  };
}

function burnNotes(notes, now = new Date()) {
  if (!Array.isArray(notes)) throw new TypeError('notes must be an array');
  const nowD = toValidDate(now);
  const todayKey = dayKey(nowD);
  const isoNow = nowD.toISOString();

  return notes.map(note => {
    const isUndated = !note.dueDate;
    const isNonRepeat = !note.repeat || note.repeat === 'none';
    const hasNoChecklist = !Array.isArray(note.items) || note.items.length === 0;
    const isEarlierDay = note.createdAt ? (dayKey(new Date(note.createdAt)) < todayKey) : false;

    const shouldBurn = note.status === 'active' && isUndated && isNonRepeat && hasNoChecklist && isEarlierDay;

    return {
      ...note,
      items: Array.isArray(note.items) ? note.items.map(i => ({ ...i })) : [],
      appBinding: note.appBinding ? { ...note.appBinding } : null,
      bounds: note.bounds ? { ...note.bounds } : null,
      ...(shouldBurn ? {
        status: 'ashes',
        burnedAt: isoNow,
        updatedAt: isoNow,
        floating: Boolean(note.floating)
      } : {})
    };
  });
}

function restoreNote(note, now = new Date()) {
  if (!note || typeof note !== 'object') throw new TypeError('Note must be an object');
  const isoNow = toValidDate(now).toISOString();

  return {
    ...note,
    items: Array.isArray(note.items) ? note.items.map(item => ({ ...item, done: false })) : [],
    status: 'active',
    createdAt: isoNow,
    updatedAt: isoNow,
    completedAt: null,
    burnedAt: null,
    focus: null,
    appBinding: note.appBinding ? { ...note.appBinding } : null,
    bounds: note.bounds ? { ...note.bounds } : null
  };
}

module.exports = {
  BOARDS,
  COLORS,
  dayKey,
  cleanUrl,
  createNote,
  canComplete,
  completeNote,
  nextOccurrence,
  burnNotes,
  restoreNote
};
