const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sticky', {
  snapshot: () => ipcRenderer.invoke('snapshot'),
  action: (type, payload = {}) => ipcRenderer.invoke('action', type, payload),
  subscribe: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
  onCommand: callback => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('command', listener);
    return () => ipcRenderer.removeListener('command', listener);
  },
});
