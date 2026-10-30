'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../src/shared/domain.cjs');

describe('Constants and dayKey', () => {
  test('BOARDS and COLORS match expected arrays', () => {
    assert.deepEqual(BOARDS, ['Focus', 'Work', 'Personal', 'Ideas', 'General', 'Reading']);
    assert.deepEqual(COLORS, ['yellow', 'rose', 'orange', 'mint', 'blue', 'lavender']);
  });

  test('dayKey returns local YYYY-MM-DD', () => {
    const fixed = new Date(2026, 4, 3); // May 3, 2026 local time
    assert.equal(dayKey(fixed), '2026-05-03');

    const endOfYear = new Date(2026, 11, 31);
    assert.equal(dayKey(endOfYear), '2026-12-31');

    assert.match(dayKey(), /^\d{4}-\d{2}-\d{2}$/);
    assert.throws(() => dayKey(null), TypeError);
    assert.throws(() => dayKey('invalid-date'), TypeError);
  });
});

describe('cleanUrl validation and filtering', () => {
  test('normalizes valid http/https URLs', () => {
    assert.equal(cleanUrl('https://fcbarcelona.com/'), 'https://fcbarcelona.com/');
    assert.equal(cleanUrl('https://fdic.gov/'), 'https://fdic.gov/');
    assert.equal(
      cleanUrl('https://example.com/notes?page=1'),
      'https://example.com/notes?page=1'
    );
    assert.equal(
      cleanUrl('http://example.org/path'),
      'http://example.org/path'
    );
  });

  test('rejects non-strings, strings > 4096 chars, or URLs containing whitespace', () => {
    assert.equal(cleanUrl(null), null);
    assert.equal(cleanUrl(123), null);
    assert.equal(cleanUrl(''), null);
    assert.equal(cleanUrl('https://example.com ' + 'a'.repeat(4097)), null);
    assert.equal(cleanUrl('https://example.com/path with spaces'), null);
    assert.equal(cleanUrl(' https://example.com'), null);
    assert.equal(cleanUrl('https://example.com '), null);
  });

  test('rejects URLs with credentials or non-http protocols', () => {
    assert.equal(cleanUrl('https://user:pass@example.com/path'), null);
    assert.equal(cleanUrl('ftp://example.com/file'), null);
    assert.equal(cleanUrl('javascript:alert(1)'), null);
  });

  test('blocks localhost, local domains, and private/loopback IP addresses', () => {
    assert.equal(cleanUrl('http://localhost:3000'), null);
    assert.equal(cleanUrl('http://dev.localhost/test'), null);
    assert.equal(cleanUrl('http://myserver.local'), null);
    assert.equal(cleanUrl('http://company.internal/wiki'), null);
    assert.equal(cleanUrl('http://127.0.0.1:8080'), null);
    assert.equal(cleanUrl('http://10.0.1.5/'), null);
    assert.equal(cleanUrl('http://172.16.0.1/'), null);
    assert.equal(cleanUrl('http://172.31.255.254/'), null);
    assert.equal(cleanUrl('http://192.168.1.100/'), null);
    assert.equal(cleanUrl('http://169.254.10.10/'), null);
    assert.equal(cleanUrl('http://0.0.0.0/'), null);
    assert.equal(cleanUrl('http://[::1]/'), null);
    assert.equal(cleanUrl('http://[fe80::1]/'), null);
    assert.equal(cleanUrl('http://[fc00::1]/'), null);
  });

  test('strips utm_*, fbclid, gclid, and msclkid tracking parameters', () => {
    const raw = 'https://example.com/article?utm_source=twitter&utm_medium=cpc&fbclid=xyz&gclid=123&msclkid=456&topic=tech';
    assert.equal(cleanUrl(raw), 'https://example.com/article?topic=tech');

    const onlyTracking = 'https://example.com/?utm_campaign=winter';
    assert.equal(cleanUrl(onlyTracking), 'https://example.com/');
  });

  test('rejects sensitive query names case-insensitively', () => {
    assert.equal(cleanUrl('https://example.com/#access_token=secret'), null);
    const sensitiveKeys = ['token', 'key', 'api_key', 'password', 'secret', 'access_token', 'auth', 'code'];
    for (const key of sensitiveKeys) {
      assert.equal(cleanUrl(`https://example.com/callback?${key}=12345`), null);
      assert.equal(cleanUrl(`https://example.com/callback?${key.toUpperCase()}=12345`), null);
    }
  });
});

describe('createNote creation and validation', () => {
  test('creates note with expected structure and defaults', () => {
    const now = new Date(2026, 9, 30, 10, 0, 0);
    const note = createNote({ text: 'Meeting notes' }, now);

    assert.equal(typeof note.id, 'string');
    assert.equal(note.text, 'Meeting notes');
    assert.deepEqual(note.items, []);
    assert.equal(note.board, 'General');
    assert.equal(note.color, 'yellow');
    assert.equal(note.status, 'active');
    assert.equal(note.createdAt, now.toISOString());
    assert.equal(note.updatedAt, now.toISOString());
    assert.equal(note.completedAt, null);
    assert.equal(note.burnedAt, null);
    assert.equal(note.dueDate, null);
    assert.equal(note.repeat, 'none');
    assert.equal(note.floating, true);
    assert.equal(note.private, false);
    assert.equal(note.ghost, false);
    assert.equal(note.appBinding, null);
    assert.equal(note.bounds, null);
    assert.equal(note.focus, null);
  });

  test('rejects non-object or entirely blank note', () => {
    assert.throws(() => createNote(null), TypeError);
    assert.throws(() => createNote('hello'), TypeError);
    assert.throws(() => createNote({ text: '   ' }), Error);
    assert.throws(() => createNote({ text: '', items: [] }), Error);
    assert.throws(() => createNote({ text: '', items: ['  ', { text: '' }] }), Error);
  });

  test('defaults title to Checklist when items exist and text is blank', () => {
    const note = createNote({ text: '  ', items: ['Task 1', { text: 'Task 2', done: true }] });
    assert.equal(note.text, 'Checklist');
    assert.equal(note.items.length, 2);
    assert.equal(note.items[0].text, 'Task 1');
    assert.equal(note.items[0].done, false);
    assert.equal(note.items[1].text, 'Task 2');
    assert.equal(note.items[1].done, true);
  });

  test('enforces limits: max 10000 text, max 100 items, max 500 item chars', () => {
    assert.throws(() => createNote({ text: 'a'.repeat(10001) }), Error);
    assert.throws(() => createNote({ text: 'Valid', items: [{ text: 'b'.repeat(501) }] }), Error);

    const tooManyItems = Array.from({ length: 101 }, (_, i) => `Item ${i}`);
    assert.throws(() => createNote({ text: 'Many items', items: tooManyItems }), Error);
  });

  test('validates real YYYY-MM-DD dueDate and repeat enum', () => {
    assert.equal(createNote({ text: 'Valid date', dueDate: '2026-02-28' }).dueDate, '2026-02-28');
    assert.throws(() => createNote({ text: 'Bad date', dueDate: '2026-02-30' }), Error);
    assert.throws(() => createNote({ text: 'Bad date', dueDate: '2026-13-01' }), Error);
    assert.throws(() => createNote({ text: 'Bad format', dueDate: '02-28-2026' }), Error);

    assert.equal(createNote({ text: 'Daily', repeat: 'daily' }).repeat, 'daily');
    assert.equal(createNote({ text: 'Weekly', repeat: 'weekly' }).repeat, 'weekly');
    assert.throws(() => createNote({ text: 'Monthly', repeat: 'monthly' }), Error);
  });

  test('honors board, color, floating, private, and ghost booleans', () => {
    const note = createNote({
      text: 'Custom note',
      board: 'Focus',
      color: 'mint',
      floating: false,
      private: true,
      ghost: true
    });
    assert.equal(note.board, 'Focus');
    assert.equal(note.color, 'mint');
    assert.equal(note.floating, false);
    assert.equal(note.private, true);
    assert.equal(note.ghost, true);

    // Fallbacks
    const fallback = createNote({ text: 'Fallback', board: 'Unknown', color: 'black' });
    assert.equal(fallback.board, 'General');
    assert.equal(fallback.color, 'yellow');
  });
});

describe('Checklist completion protection', () => {
  test('canComplete is true when no checklist or all items done', () => {
    assert.equal(canComplete({ text: 'Note without items', items: [] }), true);
    assert.equal(canComplete({ text: 'Note with items', items: [
      { id: '1', text: 'Task 1', done: true },
      { id: '2', text: 'Task 2', done: true }
    ] }), true);
  });

  test('canComplete is false when any checklist item is unfinished', () => {
    assert.equal(canComplete({ text: 'Note with open items', items: [
      { id: '1', text: 'Task 1', done: true },
      { id: '2', text: 'Task 2', done: false }
    ] }), false);
  });

  test('completeNote completes note or throws if incomplete', () => {
    const incompleteNote = createNote({
      text: 'Checklist',
      items: [{ text: 'Item 1', done: false }]
    });
    assert.throws(() => completeNote(incompleteNote), Error);

    const completeableNote = createNote({
      text: 'Checklist',
      items: [{ text: 'Item 1', done: true }]
    });
    const completeTime = new Date(2026, 9, 30, 15, 30, 0);
    const completed = completeNote(completeableNote, completeTime);

      assert.equal(completed.status, 'done');
    assert.equal(completed.completedAt, completeTime.toISOString());
    assert.equal(completed.updatedAt, completeTime.toISOString());
    assert.equal(completed.focus, null);
    // Immutability: original untouched
    assert.equal(completeableNote.status, 'active');
  });
});

describe('burnNotes rollover skipped days, protections, and local dates', () => {
  test('burns active undated nonrepeat notes with no checklist from earlier local days', () => {
    const today = new Date(2026, 9, 30, 12, 0, 0); // Oct 30, 2026
    const yesterday = new Date(2026, 9, 29, 10, 0, 0);
    const threeDaysAgo = new Date(2026, 9, 27, 8, 0, 0);

    const burnable1 = createNote({ text: 'Quick thought 1', floating: true }, yesterday);
    const burnable2 = createNote({ text: 'Quick thought 2', floating: false }, threeDaysAgo);

    const results = burnNotes([burnable1, burnable2], today);

    assert.equal(results[0].status, 'ashes');
    assert.equal(results[0].burnedAt, today.toISOString());
    assert.equal(results[0].floating, true); // floating retained

    assert.equal(results[1].status, 'ashes');
    assert.equal(results[1].burnedAt, today.toISOString());
    assert.equal(results[1].floating, false); // floating retained
  });

  test('protects notes created today', () => {
    const today = new Date(2026, 9, 30, 12, 0, 0);
    const noteCreatedToday = createNote({ text: 'Today note' }, today);

    const [result] = burnNotes([noteCreatedToday], today);
    assert.equal(result.status, 'active');
    assert.equal(result.burnedAt, null);
  });

  test('protects all checklists, dates, and repeats even from earlier days', () => {
    const today = new Date(2026, 9, 30, 12, 0, 0);
    const fourDaysAgo = new Date(2026, 9, 26, 9, 0, 0);

    const withChecklist = createNote({
      text: 'Checklist note',
      items: ['Item 1']
    }, fourDaysAgo);

    const withDueDate = createNote({
      text: 'Dated note',
      dueDate: '2026-10-25'
    }, fourDaysAgo);

    const withRepeat = createNote({
      text: 'Repeating note',
      repeat: 'daily'
    }, fourDaysAgo);

    const results = burnNotes([withChecklist, withDueDate, withRepeat], today);

    assert.equal(results[0].status, 'active');
    assert.equal(results[0].burnedAt, null);

    assert.equal(results[1].status, 'active');
    assert.equal(results[1].burnedAt, null);

    assert.equal(results[2].status, 'active');
    assert.equal(results[2].burnedAt, null);
  });
});

describe('nextOccurrence recurrence after long absence and weekly anchor', () => {
  test('returns null for non-repeating notes', () => {
    const note = createNote({ text: 'Once', repeat: 'none' });
    assert.equal(nextOccurrence(note), null);
  });

  test('daily recurrence advances to first future day after now', () => {
    // Note was due 2026-10-20. Today is 2026-10-30.
    const note = createNote({
      text: 'Daily exercise',
      dueDate: '2026-10-20',
      repeat: 'daily',
      items: [{ text: 'Pushups', done: true }]
    });

    const now = new Date(2026, 9, 30, 18, 0, 0);
    const next = nextOccurrence(note, now);

    assert.notEqual(next.id, note.id);
    assert.equal(next.status, 'active');
    assert.equal(next.dueDate, '2026-10-31'); // First day after today (Oct 30)
    assert.equal(next.items[0].done, false); // unchecked
    assert.notEqual(next.items[0].id, note.items[0].id); // fresh item id
  });

  test('weekly recurrence after long absence strictly preserves weekly anchor day', () => {
    // Note anchored on Friday 2026-06-05.
    // User absent for ~5 months. Today is Wednesday 2026-10-28.
    const weeklyFridayNote = createNote({
      text: 'Weekly review',
      dueDate: '2026-06-05',
      repeat: 'weekly',
      items: [{ text: 'Review inbox', done: true }]
    });

    const nowWednesday = new Date(2026, 9, 28, 14, 0, 0); // 2026-10-28 Wednesday
    const next = nextOccurrence(weeklyFridayNote, nowWednesday);

    // First future Friday after Wednesday Oct 28, 2026 is Friday Oct 30, 2026
    assert.equal(next.dueDate, '2026-10-30');
    const [y, m, d] = next.dueDate.split('-').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    assert.equal(dayOfWeek, 5); // 5 is Friday, preserving anchor!
  });

  test('weekly recurrence completed on the due date advances to next week', () => {
    // Friday Oct 30, 2026. Completed on Friday Oct 30, 2026.
    const note = createNote({
      text: 'Friday sync',
      dueDate: '2026-10-30',
      repeat: 'weekly'
    });
    const nowFriday = new Date(2026, 9, 30, 17, 0, 0);
    const next = nextOccurrence(note, nowFriday);

    assert.equal(next.dueDate, '2026-11-06'); // next Friday
  });

  test('nextOccurrence inherits metadata and resets focus', () => {
    const note = createNote({
      text: 'Decorated note',
      board: 'Ideas',
      color: 'lavender',
      repeat: 'daily',
      floating: false,
      private: true,
      ghost: true,
      appBinding: { app: 'notepad.exe' },
      bounds: { x: 10, y: 20, width: 200, height: 300 }
    });

    const next = nextOccurrence(note, new Date(2026, 9, 30));
    assert.equal(next.text, 'Decorated note');
    assert.equal(next.board, 'Ideas');
    assert.equal(next.color, 'lavender');
    assert.equal(next.floating, false);
    assert.equal(next.private, true);
    assert.equal(next.ghost, true);
    assert.deepEqual(next.appBinding, { app: 'notepad.exe' });
    assert.deepEqual(next.bounds, { x: 10, y: 20, width: 200, height: 300 });
    assert.equal(next.focus, null);
    assert.equal(next.completedAt, null);
    assert.equal(next.burnedAt, null);
  });
});

describe('restoreNote restoration', () => {
  test('restores completed or burned note to active with unchecked items and fresh timestamps', () => {
    const original = createNote({
      text: 'Original checklist',
      items: [{ text: 'Item 1', done: true }, { text: 'Item 2', done: true }]
    }, new Date(2026, 9, 20));

    const completed = completeNote(original, new Date(2026, 9, 25));
    assert.equal(completed.status, 'done');

    const restoreTime = new Date(2026, 9, 30, 11, 0, 0);
    const restored = restoreNote(completed, restoreTime);

    assert.equal(restored.id, original.id);
    assert.equal(restored.status, 'active');
    assert.equal(restored.createdAt, restoreTime.toISOString());
    assert.equal(restored.updatedAt, restoreTime.toISOString());
    assert.equal(restored.completedAt, null);
    assert.equal(restored.burnedAt, null);
    assert.equal(restored.focus, null);
    assert.equal(restored.items.length, 2);
    assert.equal(restored.items[0].done, false);
    assert.equal(restored.items[1].done, false);
  });
});
