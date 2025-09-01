// in cima:
const path = require('path');
const os = require('os');
const mdns = require('multicast-dns')();
const QRCode = require('qrcode');

const HTTP_PORT = process.env.HTTP_PORT || 5173;
const MDNS_NAME = 'lyrixhost.local';

// IMPORTANT: puntiamo a una COPIA del server.js dentro lyrix-host/bundle/
const SERVER_MODULE = path.resolve(__dirname, 'bundle', 'server.js');
let serverHandle = null;

// ...
function startServer() {
  if (serverHandle) return;
  const { startEmbedded } = require(SERVER_MODULE);
  serverHandle = startEmbedded({ host: '0.0.0.0', port: HTTP_PORT });
  isServerRunning = true;
  updateTray();
  if (mainWindow) mainWindow.webContents.send('host:serverState', { running: true });
}

async function stopServer() {
  if (!serverHandle) return;
  try { await serverHandle.stop(); } catch {}
  serverHandle = null;
  isServerRunning = false;
  updateTray();
  if (mainWindow) mainWindow.webContents.send('host:serverState', { running: false });
}


function createWindow(show = true) {
  if (mainWindow) { if (show) mainWindow.show(); return; }
  mainWindow = new BrowserWindow({
    width: 420,
    height: 540,
    resizable: false,
    title: 'Lyrix Host',
    show: show,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => { mainWindow = null; });
}

function updateTray() {
  if (!tray) return;
  const context = Menu.buildFromTemplate([
    { label: isServerRunning ? 'Stop Server' : 'Start Server', click: () => {
        isServerRunning ? stopServer() : startServer();
      }},
    { type: 'separator' },
    { label: 'Open Browser', click: () => shell.openExternal(publicURL) },
    { label: 'Show Window (QR)', click: () => { createWindow(true); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(context);
  tray.setToolTip(`Lyrix Host ${isServerRunning ? '(running)' : '(stopped)'}`);
}

async function getQRDataURL() {
  try {
    return await QRCode.toDataURL(publicURL, { margin: 1, scale: 6 });
  } catch {
    return null;
  }
}

function setupIPC() {
  ipcMain.handle('host:get-info', async () => {
    return {
      url: publicURL,
      ip: lanIP,
      mdns: MDNS_NAME,
      port: Number(HTTP_PORT),
      running: isServerRunning,
      qr: await getQRDataURL()
    };
  });

  ipcMain.handle('host:open-browser', () => shell.openExternal(publicURL));
  ipcMain.handle('host:toggle-server', () => {
    isServerRunning ? stopServer() : startServer();
  });
}

function createTray() {
  tray = new Tray(process.platform === 'darwin'
    ? path.join(__dirname, 'renderer', 'iconTemplate.png')
    : path.join(__dirname, 'renderer', 'icon.png')
  );
  updateTray();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Se c'è già un'istanza, inviale il comando (es. --show-qr)
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    if (argv.includes('--show-qr')) createWindow(true);
    if (mainWindow) mainWindow.show();
  });

  app.whenReady().then(() => {
    setupIPC();
    createTray();
    createWindow(false);  // apri nascosto; l’utente può aprire dal tray
    startServer();        // avvia subito il server in background
  });

  app.on('window-all-closed', (e) => {
    // Mantieni tray attivo su Windows; su macOS potresti volere lo stesso
    e.preventDefault();
  });

  app.on('before-quit', () => {
    stopServer();
    try { mdns.destroy(); } catch {}
  });
}

// CLI per il plugin: LyrixHost.exe --show-qr
if (process.argv.includes('--show-qr')) {
  app.whenReady().then(() => createWindow(true));
}
