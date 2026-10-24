// Обёртка для запуска игры как обычного приложения
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// музыка и звуки включаются сразу, без клика
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 800, minHeight: 500,
    title: 'Придорожный Мотель', backgroundColor: '#0c070b',
    icon: path.join(__dirname, 'game', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'game', 'index.html'));
  // F11 — полный экран
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
