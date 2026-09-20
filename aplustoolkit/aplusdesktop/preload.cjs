'use strict';

/**
 * What the page is allowed to reach.
 *
 * `contextIsolation` is on and `nodeIntegration` is off, so the web app has no
 * access to Node or to the file system. It gets exactly the calls below,
 * each of which does one thing and asks the user where a person must decide.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__APLUS_DESKTOP__', true);

contextBridge.exposeInMainWorld('aplusDesktop', {
  platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux',
  /** Port and token of a running MCP server, or null. */
  bridgeInfo: () => ipcRenderer.invoke('aplus:bridgeInfo'),
  /** Native save dialog. Resolves true if the file was written. */
  saveFile: (name, bytes) => ipcRenderer.invoke('aplus:saveFile', name, bytes),
  /** Plug A+ Write into Claude Desktop (asks first). */
  setupClaude: () => ipcRenderer.invoke('aplus:setupClaude'),
  /** The folder scripts are copied to as .fountain files, or null when off. */
  mirrorFolder: () => ipcRenderer.invoke('aplus:mirrorFolder'),
  /** Native folder picker. Resolves to the chosen folder (or the old one if cancelled). */
  mirrorChoose: () => ipcRenderer.invoke('aplus:mirrorChoose'),
  mirrorClear: () => ipcRenderer.invoke('aplus:mirrorClear'),
  /** Copies one script. The folder is never named here: only an id, a title and the text. */
  mirrorWrite: (id, title, text) => ipcRenderer.invoke('aplus:mirrorWrite', id, title, text),
});

// The stylesheet reads this to leave room for the real window controls.
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.desktop = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
});
