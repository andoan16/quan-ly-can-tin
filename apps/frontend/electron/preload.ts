import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  printReceipt: (html: string) => Promise<boolean>;
}

contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (html: string) => ipcRenderer.invoke('print-receipt', html),
} as ElectronAPI);
