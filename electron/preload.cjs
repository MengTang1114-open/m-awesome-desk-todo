// 页面能用的全部本机能力（见 src/bridge.ts 的 Desk 类型）
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desk', {
  read: () => ipcRenderer.invoke('read'),
  write: text => ipcRenderer.invoke('write', text),
  filePath: () => ipcRenderer.invoke('path'),
  onFile: cb => ipcRenderer.on('file', (_, text) => cb(text)),
  onCursor: cb => ipcRenderer.on('cursor', (_, p) => cb(p)),
  interactive: on => ipcRenderer.send('interactive', on),
  moveBy: (dx, dy) => ipcRenderer.send('moveBy', dx, dy),
  reveal: () => ipcRenderer.send('reveal'),
  onQuickAdd: cb => ipcRenderer.on('quickadd', () => cb()),
  blur: () => ipcRenderer.send('blur'),
  settings: () => ipcRenderer.invoke('settings'),
  onSettings: cb => ipcRenderer.on('settings', (_, s) => cb(s)),
  saveSettings: patch => ipcRenderer.send('saveSettings', patch),
  petMenu: slot => ipcRenderer.send('petMenu', slot),
})
