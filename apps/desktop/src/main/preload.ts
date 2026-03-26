import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Menu actions
  onMenuNewConnection: (callback: () => void) => {
    ipcRenderer.on('menu-new-connection', callback);
  },

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // App info
  getAppVersion: () => {
    return process.env.npm_package_version || '0.1.0';
  },

  // Platform info
  getPlatform: () => {
    return process.platform;
  },
});

// Type definitions for the exposed API
export interface ElectronAPI {
  onMenuNewConnection: (callback: () => void) => void;
  removeAllListeners: (channel: string) => void;
  getAppVersion: () => string;
  getPlatform: () => string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}