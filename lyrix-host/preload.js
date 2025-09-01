const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lyrixHost', {
  getInfo: () => ipcRenderer.invoke('host:get-info'),
  openBrowser: () => ipcRenderer.invoke('host:open-browser'),
  toggleServer: () => ipcRenderer.invoke('host:toggle-server'),
  onServerState: (cb) => ipcRenderer.on('host:serverState', (_e, payload) => cb(payload))
});
