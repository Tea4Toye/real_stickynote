// Keep native window styles stable while the observer samples the desktop.
const applied = new WeakMap();

function applyNativeState(win, desired, lowerWindow) {
  const previous = applied.get(win) || {};
  if ('protection' in desired && desired.protection !== previous.protection) win.setContentProtection(desired.protection);
  if ('ignoreMouse' in desired && desired.ignoreMouse !== previous.ignoreMouse) win.setIgnoreMouseEvents(desired.ignoreMouse, { forward: true });
  if ('opacity' in desired && desired.opacity !== previous.opacity) win.setOpacity(desired.opacity);
  if ('topmost' in desired && desired.topmost !== previous.topmost) {
    win.setAlwaysOnTop(desired.topmost, 'screen-saver');
    if (desired.topmost && previous.topmost === false) win.moveTop();
  }
  if (desired.lowered === true && previous.lowered !== true) lowerWindow?.(win);
  applied.set(win, { ...previous, ...desired });
}

module.exports = { applyNativeState };
