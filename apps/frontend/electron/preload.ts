import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  printReceipt: (html: string) => Promise<boolean>;
  printToPDF: (html: string, fileName: string) => Promise<string | null>;
}

contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (html: string) => ipcRenderer.invoke('print-receipt', html),
  printToPDF: (html: string, fileName: string) => ipcRenderer.invoke('print-to-pdf', html, fileName),
} as ElectronAPI);
