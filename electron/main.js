// electron/main.js
const { app, BrowserWindow, dialog, Menu, ipcMain, shell } = require('electron'); // Add shell
const path = require('path');
const url = require('url');
const fs = require('fs'); // Add fs
const db = require('./database');

// isDevの代わりにapp.isPackagedを使用
const isDev = !app.isPackaged;

// Directory for storing uploaded files
const uploadsPath = path.join(app.getPath('userData'), 'user_uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

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
      webSecurity: false, // Consider security implications if enabling this
    },
    icon: path.join(__dirname, isDev ? '../public/favicon.ico' : '../dist/favicon.ico')
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
    // Ensure position is stringified if it's not already (it seems it is from page.tsx)
    return await db.updateNodePosition(id, typeof position === 'string' ? position : JSON.stringify(position));
  });
  ipcMain.handle('db:updateNodeData', async (event, { id, data }) => {
    return await db.updateNodeData(id, data); // data should be an object, database.js will stringify
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

  // New IPC Handlers for local file operations
  ipcMain.handle('file:saveLocal', async (event, fileName, fileDataBuffer) => {
    try {
      const filePath = path.join(uploadsPath, fileName);
      // Ensure the directory exists (it should from app startup)
      if (!fs.existsSync(uploadsPath)) {
        fs.mkdirSync(uploadsPath, { recursive: true });
      }
      fs.writeFileSync(filePath, Buffer.from(fileDataBuffer));
      return filePath;
    } catch (error) {
      console.error('Failed to save file locally:', error);
      throw error;
    }
  });

  ipcMain.handle('file:openLocal', async (event, filePath) => {
    try {
      // Check if file exists before attempting to open
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

  ipcMain.handle('file:getUploadsDir', () => {
    return uploadsPath;
  });
}


app.whenReady().then(async () => {
  try {
    await db.initDatabase();
    console.log('Database initialized successfully. Path:', db.dbPath);
    console.log('Uploads directory:', uploadsPath); // Log uploads path
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