const { spawn } = require('node:child_process');
const path = require('node:path');

function observeWindows(onUpdate, onError) {
  if (process.platform !== 'win32') return { stop() {} };
  const helperPath = path.join(__dirname, 'observe-windows.ps1').replace('app.asar'+path.sep, 'app.asar.unpacked'+path.sep);
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath], { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let pending = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    pending += chunk;
    const lines = pending.split(/\r?\n/); pending = lines.pop();
    for (const line of lines) {
      try { onUpdate(JSON.parse(line)); } catch { /* Ignore non-JSON startup output. */ }
    }
    if (pending.length > 100000) pending = '';
  });
  child.on('error', error => onError(error.message));
  child.stderr.on('data', data => onError(String(data).slice(0,1000)));
  child.on('exit', code => { if (code) onError(`Windows observer exited (${code}).`); });
  return { stop() { child.kill(); } };
}
module.exports = { observeWindows };
