// Electron main process
// Note: This file uses CommonJS (.cjs) to ensure compatibility with Electron's module system

let app, BrowserWindow, ipcMain, dialog, shell, safeStorage

try {
  const electron = require('electron')

  if (typeof electron === 'string') {
    console.error('ERROR: Electron API not available - try: npx electron . or npm run app')
    process.exit(1)
  }

  ;({ app, BrowserWindow, ipcMain, dialog, shell, safeStorage, session } = electron)

  if (!app || !BrowserWindow) {
    console.error('ERROR: Electron modules not properly loaded')
    process.exit(1)
  }

  console.log('Electron main process initialized')
} catch (error) {
  console.error('ERROR: Failed to load Electron:', error.message)
  process.exit(1)
}

const path = require('path')
const fs = require('fs')
const { createWindow } = require('./window.cjs')
const { registerFsHandlers } = require('./ipc/fs.cjs')
const { registerStoreHandlers } = require('./ipc/store.cjs')
const { registerShellHandlers } = require('./ipc/shell.cjs')
const { registerUpdaterHandlers } = require('./ipc/updater.cjs')
const { initAutoUpdater, setMainWindow } = require('./updater.cjs')

const isDev = !app.isPackaged

let mainWindow = null
let agentServer = null
let agentPort = 3456
const getMainWindow = () => mainWindow

// Polyfill File for undici (not exposed in Electron's Node.js)
if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File {
    constructor(bits, name, options = {}) {
      this.name = name || ''
      this.lastModified = options.lastModified || Date.now()
      this.size = (bits || []).reduce((s, b) => s + (typeof b === 'string' ? b.length : (b?.byteLength || b?.length || 0)), 0)
      this.type = options.type || ''
    }
  }
}

// VS Code-inspired performance flags
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
}

// Register all IPC handlers
registerFsHandlers(ipcMain)
registerStoreHandlers(ipcMain, app, safeStorage)
registerShellHandlers(ipcMain, getMainWindow, shell, dialog)
registerUpdaterHandlers(ipcMain)

ipcMain.handle('get-app-data-path', () => app.getPath('userData'))
ipcMain.handle('get-api-port', () => agentPort)

// ── Data management IPC handlers ──────────────────────────────────

ipcMain.handle('data:get-info', async () => {
  const userData = app.getPath('userData')
  const baseName = path.basename(userData)

  function getDirSize(dirPath) {
    let size = 0
    if (!fs.existsSync(dirPath)) return size
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fp = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          size += getDirSize(fp)
        } else if (entry.isFile()) {
          try { size += fs.statSync(fp).size } catch (_) { /* skip */ }
        }
      }
    } catch (_) { /* skip */ }
    return size
  }

  function countFiles(dirPath) {
    if (!fs.existsSync(dirPath)) return 0
    try { return fs.readdirSync(dirPath).filter(f => f.endsWith('.json')).length } catch (_) { return 0 }
  }

  function countAnyFiles(dirPath) {
    if (!fs.existsSync(dirPath)) return 0
    try { return fs.readdirSync(dirPath).length } catch (_) { return 0 }
  }

  const lancedbPath = path.join(userData, 'lancedb')
  const promptsPath = path.join(userData, 'prompts', 'dynamic_prompts')
  const conversationsPath = path.join(userData, 'conversations')

  return {
    vectorDb: {
      path: `${baseName}${path.sep}lancedb`,
      sizeBytes: getDirSize(lancedbPath)
    },
    prompts: {
      path: `${baseName}${path.sep}prompts${path.sep}dynamic_prompts`,
      customCount: countFiles(path.join(promptsPath, 'Loop')) + countFiles(path.join(promptsPath, 'Rephrase')),
      defaultCount: 2
    },
    conversations: {
      path: `${baseName}${path.sep}conversations`,
      fileCount: countAnyFiles(conversationsPath),
      sizeBytes: getDirSize(conversationsPath)
    }
  }
})

ipcMain.handle('data:reset-vector-db', async () => {
  const { SysAgent } = await import('../system/agents/SysAgent/index.mjs')
  const sysAgent = new SysAgent()
  await sysAgent.resetVectorDB()
  return { success: true }
})

ipcMain.handle('data:reset-prompts', async () => {
  const { SysAgent } = await import('../system/agents/SysAgent/index.mjs')
  const sysAgent = new SysAgent()
  sysAgent.resetPrompts()
  return { success: true }
})

ipcMain.handle('data:clear-conversations', async () => {
  const conversationsPath = path.join(app.getPath('userData'), 'conversations')
  if (fs.existsSync(conversationsPath)) {
    const files = fs.readdirSync(conversationsPath)
    for (const file of files) {
      try {
        const fp = path.join(conversationsPath, file)
        const stat = fs.statSync(fp)
        if (stat.isFile()) fs.unlinkSync(fp)
      } catch (_) { /* skip locked files */ }
    }
  }
  return { success: true }
})

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.evpagent.app')
  }

  // Set config resolution paths before loading the API module.
  // In packaged builds config.example.json is shipped inside app.asar;
  // the user's config.json lives in the persistent userData folder.
  process.env.EVPAGENT_EXAMPLE_CONFIG_PATH = path.join(app.getAppPath(), 'config.example.json')
  process.env.EVPAGENT_USER_CONFIG_PATH    = path.join(app.getPath('userData'), 'config.json')

  // Start EVPAgent API server on a dynamic port
  try {
    const { start } = await import('../src/api/index.mjs')
    agentServer = await start(0)
    agentPort = agentServer.address().port
    console.log(`EVPAgent API server started on http://localhost:${agentPort}`)
  } catch (err) {
    console.error('Failed to start EVPAgent server:', err)
  }

  // Inject CORS headers so the renderer can fetch cross-origin media for download
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*']
      }
    })
  })

  // Redirect native media downloads (video/audio controls) to default browser
  session.defaultSession.on('will-download', (event, item) => {
    event.preventDefault()
    shell.openExternal(item.getURL())
  })

  mainWindow = createWindow({
    BrowserWindow,
    shell,
    ipcMain,
    isDev,
    onWindowReady: (win) => { mainWindow = win; setMainWindow(win) }
  })

  initAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow({
        BrowserWindow,
        shell,
        ipcMain,
        isDev,
        onWindowReady: (win) => { mainWindow = win }
      })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (agentServer) {
    try { agentServer.close(); } catch (_) { /* ignore */ }
    agentServer = null
  }
})

console.log('App data path:', app.getPath('userData'))
console.log('Dev mode:', isDev)
