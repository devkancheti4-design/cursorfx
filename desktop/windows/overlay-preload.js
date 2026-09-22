// Carries pointer updates into the overlay page as structured messages.
// Evaluating a JavaScript string sixty times a second means building, parsing and
// compiling source on every frame; an IPC message skips all three.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__bridge', {
  onInput(handler) {
    ipcRenderer.on('cfx', (_e, m) => handler(m));
  },
});
