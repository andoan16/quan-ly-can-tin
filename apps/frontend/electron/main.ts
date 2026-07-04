import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

// Production: load file đã build. Development: load vite dev server.
// Khi chạy `npm run prod` (NODE_ENV=production, chưa packaged) → cũng load file.
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('print-receipt', async (_event, html: string) => {
  // MVP: trả về true; sau này mở silent print window
  console.log('Print receipt:', html.slice(0, 200));
  return true;
});
