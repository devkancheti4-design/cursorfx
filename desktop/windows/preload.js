// Bridge for the widget window. The overlay windows do not use this: they are driven
// by executeJavaScript from the main process so they stay a plain static page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cursorfx', {
  getState: () => ipcRenderer.invoke('state'),
  set: (patch) => ipcRenderer.invoke('set', patch),
  quit: () => ipcRenderer.send('quit'),
  resize: (height) => ipcRenderer.send('resize', height),
  onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s)),
});
