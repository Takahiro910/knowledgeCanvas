// electron/main.js
const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const db = require('./database');

// isDevの代わりにapp.isPackagedを使用
const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Knowledge Canvas',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // main.jsからの相対パス
      webSecurity: false,
    },
    icon: path.join(__dirname, isDev ? '../public/favicon.ico' : '../dist/favicon.ico') // main.jsからの相対パス
    // 注意: electron-builderでassetsフォルダをbuildResourcesに指定している場合、
    // 本番環境のアイコンパスは process.resourcesPath を基準にすることが多いです。
    // 例: icon: path.join(process.resourcesPath, 'assets/icon.ico') (ymlでbuildResources: assets とした場合)
    // 今回はdistにfaviconが含まれる前提で ../dist/favicon.ico としています。
  });

  const startUrl = isDev
    ? 'http://localhost:9002'
    : url.format({
        // ★★★ パス指定を __dirname (main.js の場所) からの相対パスに変更 ★★★
        // app.asar 内で main.js は electron フォルダに配置される想定
        // そこから一つ上の階層の dist フォルダ内の index.html を指す
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

  // --- メニュー設定 ---
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

// --- IPCハンドラーのセットアップ ---
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
    return await db.updateNodePosition(id, JSON.stringify(position));
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
              { name: 'Documents & Images', extensions: ['pdf', 'docx', 'txt', 'jpg', 'jpeg', 'png'] },
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
}


app.whenReady().then(async () => {
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

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
