// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // データベース操作関数
  getAllNodes: () => ipcRenderer.invoke('db:getAllNodes'),
  getAllLinks: () => ipcRenderer.invoke('db:getAllLinks'),
  addNode: (node) => ipcRenderer.invoke('db:addNode', node),
  addLink: (link) => ipcRenderer.invoke('db:addLink', link),
  updateNodePosition: (id, position) => ipcRenderer.invoke('db:updateNodePosition', { id, position }),
  updateNodeData: (id, data) => ipcRenderer.invoke('db:updateNodeData', { id, data }),
  deleteNode: (id) => ipcRenderer.invoke('db:deleteNode', id),
  deleteLink: (id) => ipcRenderer.invoke('db:deleteLink', id),

  // ファイルダイアログ
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (defaultPath) => ipcRenderer.invoke('dialog:saveFile', defaultPath),

  // New Local File Operations
  saveLocalFile: (fileName, fileDataBuffer) => ipcRenderer.invoke('file:saveLocal', fileName, fileDataBuffer),
  openLocalFile: (filePath) => ipcRenderer.invoke('file:openLocal', filePath),
  getUploadsDir: () => ipcRenderer.invoke('file:getUploadsDir'), // Optional: if needed by renderer

  // 他に必要なAPIがあればここに追加
});