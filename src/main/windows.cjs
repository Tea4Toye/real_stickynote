const { spawn } = require('node:child_process');
const path = require('node:path');

function observeWindows(onUpdate, onError) {
  if (process.platform !== 'win32') return { stop() {} };
  const helperPath = path.join(__dirname, 'observe-windows.ps1').replace('app.asar'+path.sep, 'app.asar.unpacked'+path.sep);
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  let pending = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    pending += chunk;
    const lines = pending.split(/\r?\n/); pending = lines.pop();
    for (const line of lines) {
      let update;
      try { update=JSON.parse(line); } catch { continue; }
      try { onUpdate(update); } catch(error) { onError(`Could not update note windows: ${error.message}`); }
    }
    if (pending.length > 100000) pending = '';
  });
  child.on('error', error => onError(error.message));
  child.stderr.on('data', data => onError(String(data).slice(0,1000)));
  child.on('exit', code => { if (code) onError(`Windows observer exited (${code}).`); });
  child.stdin.on('error',()=>{});
  return {
    lowerWindow(handle) {
      if(child.stdin.destroyed)return;
      const value=handle.length>=8?handle.readBigUInt64LE(0):BigInt(handle.readUInt32LE(0));
      child.stdin.write(JSON.stringify({type:'lower',handle:value.toString()})+'\n');
    },
    stop() { child.kill(); },
  };
}
module.exports = { observeWindows };
