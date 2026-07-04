import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

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

// ── In hoá đơn ──────────────────────────────────────────────
// Mở một hidden window chứa HTML receipt, gọi webContents.print()
ipcMain.handle('print-receipt', async (_event, html: string) => {
  try {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise<void>((resolve) => {
      printWin.webContents.on('did-finish-load', () => resolve());
    });
    await printWin.webContents.print({
      silent: false,
      printBackground: true,
      margins: { marginType: 'none' },
    });
    printWin.close();
    return true;
  } catch (err) {
    console.error('Print error:', err);
    return false;
  }
});

// ── Xuất hoá đơn PDF ────────────────────────────────────────
// Tạo PDF từ HTML, lưu vào thư mục Downloads, mở file
ipcMain.handle('print-to-pdf', async (_event, html: string, fileName: string) => {
  try {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise<void>((resolve) => {
      printWin.webContents.on('did-finish-load', () => resolve());
    });
    const pdfData = await printWin.webContents.printToPDF({
      marginsType: 0,
      printBackground: true,
      pageSize: { width: 80000, height: 120000 }, // ~80mm x 120mm — thermal receipt size
    });
    printWin.close();

    const downloadsDir = path.join(os.homedir(), 'Downloads');
    const filePath = path.join(downloadsDir, fileName);
    fs.writeFileSync(filePath, pdfData);
    shell.openPath(filePath);
    return filePath;
  } catch (err) {
    console.error('PDF error:', err);
    dialog.showErrorBox('Lỗi xuất PDF', 'Không thể tạo file PDF. Vui lòng thử lại.');
    return null;
  }
});
