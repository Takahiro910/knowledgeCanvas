// electron/main.js
const { app, BrowserWindow, dialog, Menu, ipcMain, shell } = require('electron'); // Add shell
const path = require('path');
const url = require('url');
const fs = require('fs'); // Already present
const db = require('./database');

// isDevの代わりにapp.isPackagedを使用
const isDev = !app.isPackaged;

// --- Window State Management ---
const SETTINGS_FILE_NAME = 'window-settings.json';
// settingsPath will be initialized in app.whenReady once app.getPath is available
let settingsPath;
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

function loadWindowSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const settingsData = fs.readFileSync(settingsPath, 'utf-8');
            const settings = JSON.parse(settingsData);
            if (settings && typeof settings.width === 'number' && typeof settings.height === 'number') {
                // Basic validation for sensible dimensions (optional, but good practice)
                if (settings.width >= 300 && settings.height >= 200) {
                    return { width: settings.width, height: settings.height };
                }
            }
        }
    } catch (error) {
        console.error('Failed to load window settings, using defaults:', error);
    }
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

function saveWindowSettings() {
    if (mainWindow) { // Ensure mainWindow exists
        try {
            const bounds = mainWindow.getBounds();
            const settings = {
                width: bounds.width,
                height: bounds.height
            };
            if (settingsPath) { // Ensure settingsPath is initialized
                fs.writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8');
                // console.log('Window settings saved:', settings); // Optional: for debugging
            }
        } catch (error) {
            console.error('Failed to save window settings:', error);
        }
    }
}
// --- End Window State Management ---


let mainWindow;

function createWindow() {
  // Load window settings before creating the window
  const { width, height } = loadWindowSettings();

  mainWindow = new BrowserWindow({
    width: width, // Use loaded or default width
    height: height, // Use loaded or default height
    title: 'Knowledge Canvas',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // main.jsからの相対パス
      webSecurity: false, // Consider security implications if enabling this
    },
    icon: path.join(__dirname, isDev ? '../public/favicon.ico' : '../dist/favicon.ico')
  });

  // Save window state on resize and close
  mainWindow.on('resized', saveWindowSettings);
  mainWindow.on('moved', saveWindowSettings); // Also save if position is desired in the future, for size only this is not strictly needed but good for consistency
  
  // The 'close' event is a good place for a final save.
  // However, 'resized' and 'moved' should cover most cases.
  // For a more robust save on exit, especially if the window might be closed by app.quit(),
  // consider also saving in app.on('before-quit', saveWindowSettings);
  mainWindow.on('close', () => {
    saveWindowSettings(); // Ensure final state is saved
    // mainWindow will be nullified after this by Electron or in 'closed' event
  });

  mainWindow.on('closed', () => {
    mainWindow = null; // Dereference the window object
  });


  const startUrl = isDev
    ? 'http://localhost:9002'
    : url.format({
        pathname: path.join(__dirname, '../dist/index.html'),
        protocol: 'file:',
        slashes: true,
      });

  console.log(`Loading URL: ${startUrl}`);
  mainWindow.loadURL(startUrl)
    .then(() => {
      console.log('URL loaded successfully.');
    })
    .catch(err => {
      console.error('Failed to load URL:', startUrl, err);
      dialog.showErrorBox('Load Error', `Failed to load URL: ${startUrl}\n${err.message}`);
    });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    }
  ];
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

function setupIpcHandlers() {
  ipcMain.handle('db:getAllNodes', async () => {
    return await db.getAllNodes();
  });
  ipcMain.handle('db:getAllLinks', async () => {
    return await db.getAllLinks();
  });
  ipcMain.handle('db:addNode', async (event, node) => {
    return await db.addNode(node);
  });
  ipcMain.handle('db:addLink', async (event, link) => {
    return await db.addLink(link);
  });
  ipcMain.handle('db:updateNodePosition', async (event, { id, position }) => {
    return await db.updateNodePosition(id, typeof position === 'string' ? position : JSON.stringify(position));
  });
  ipcMain.handle('db:updateNodeData', async (event, { id, data }) => {
    return await db.updateNodeData(id, data);
  });
  ipcMain.handle('db:deleteNode', async (event, id) => {
      await db.deleteLinksByNodeId(id);
      return await db.deleteNode(id);
  });
  ipcMain.handle('db:deleteLink', async (event, id) => {
    return await db.deleteLink(id);
  });
  ipcMain.handle('dialog:openFile', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
          properties: ['openFile', 'multiSelections'],
          filters: [
              { name: 'Documents, Spreadsheets, Presentations & Images', extensions: ['pdf', 'docx', 'doc', 'txt', 'xlsx', 'xlsm', 'xls', 'pptx', 'ppt', 'jpg', 'jpeg', 'png', 'gif', 'svg'] }, // ★ 更新
              { name: 'All Files', extensions: ['*'] }
          ]
      });
      return canceled ? [] : filePaths;
  });
  ipcMain.handle('dialog:saveFile', async (event, defaultPath) => {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
          defaultPath: defaultPath,
      });
      return canceled ? null : filePath;
  });

  ipcMain.handle('file:openLocal', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        dialog.showErrorBox('File Not Found', `The file at ${filePath} could not be found.`);
        return false;
      }
      await shell.openPath(filePath);
      return true;
    } catch (error) {
      console.error('Failed to open file locally:', error);
      dialog.showErrorBox('Error Opening File', `Could not open the file: ${error.message}`);
      return false;
    }
  });
  ipcMain.handle('shell:openExternal', async (event, urlToOpen) => {
    try {
      await shell.openExternal(urlToOpen);
      return true;
    } catch (error) {
      console.error('Failed to open external URL:', error);
      dialog.showErrorBox('Error Opening Link', `Could not open the URL: ${error.message}`);
      return false;
    }
  });
}


app.whenReady().then(async () => {
  // Initialize settingsPath here, as app.getPath('userData') is now available
  settingsPath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME);

  try {
    await db.initDatabase();
    console.log('Database initialized successfully. Path:', db.dbPath);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    dialog.showErrorBox('Database Error', `Failed to initialize database: ${error.message}`);
    app.quit();
    return;
  }

  setupIpcHandlers();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  // This is a good place for a final save attempt,
  // especially if the app is quit by means other than closing the window directly (e.g., Cmd+Q or system shutdown)
  if (mainWindow && !mainWindow.isDestroyed()) {
      saveWindowSettings();
  }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    // Before quitting, ensure settings are saved if mainWindow reference might still be valid.
    // However, the 'close' event on the window itself is usually sufficient.
    // if (mainWindow) { // This check might be problematic if mainWindow is already nulled by 'closed' event
    //   saveWindowSettings();
    // }
    app.quit();
  }
});