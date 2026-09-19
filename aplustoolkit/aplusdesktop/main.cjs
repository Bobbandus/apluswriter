'use strict';

/**
 * A+ Write — desktop shell.
 *
 * A thin frame around the same web app. The point of having one at all:
 *
 * - Claude Desktop can reach a native app on this machine without a web page
 *   in between, and one click here plugs it in (see `setupClaude`).
 * - The window is drawn by the app (the macOS-style titlebar), with the real
 *   window controls where the OS puts them.
 * - Saving goes through the OS save dialog.
 *
 * It contains no product logic. Anything a writer does, they do in the web
 * app; this file only offers what a browser tab cannot.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const claude = require('./claudeConfig.cjs');

const isDev = !app.isPackaged;
const START_URL = process.env.APLUS_URL || 'http://localhost:3000';
const sv = (app.getLocale() || 'en').toLowerCase().startsWith('sv');
const say = (swedish, english) => (sv ? swedish : english);

let win = null;

/* ------------------------------------------------------------------ window */

function createWindow() {
  const mac = process.platform === 'darwin';

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#131317',
    title: 'A+ Write',
    // The web app draws its own titlebar. On macOS the real traffic lights sit
    // inside it; on Windows the native min/max/close overlay the right edge.
    ...(mac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 12 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#17171c', symbolColor: '#9a9aa4', height: 38 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // A link to anywhere else opens in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== new URL(START_URL).origin) {
      event.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });

  void win.loadURL(START_URL).catch(() => {
    void win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<body style="font:15px system-ui;background:#131317;color:#f4f2ec;display:grid;place-items:center;height:100vh;margin:0">` +
            `<div style="max-width:420px"><h2>${say('Kunde inte nå A+ Write', 'Could not reach A+ Write')}</h2>` +
            `<p style="color:#9a9aa4;line-height:1.5">${say(
              'Starta webbappen med <code>npm run dev</code> och försök igen.',
              'Start the web app with <code>npm run dev</code> and try again.',
            )}</p><p style="color:#6a6a74">${START_URL}</p></div></body>`,
        ),
    );
  });

  win.on('closed', () => {
    win = null;
  });
}

/* --------------------------------------------------- what the page may ask */

/** The newest live MCP server's port and token, or null. */
function bridgeInfo() {
  try {
    const dir = process.env.APLUS_BRIDGE_DIR || path.join(os.homedir(), '.aplus-write');
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'bridge.json'), 'utf8'));
    const alive = (file.servers || []).filter((s) => {
      try {
        process.kill(s.pid, 0);
        return true;
      } catch (error) {
        return error && error.code === 'EPERM';
      }
    });
    alive.sort((a, b) => b.startedAt - a.startedAt);
    return alive[0] ? { port: alive[0].port, token: alive[0].token } : null;
  } catch {
    return null;
  }
}

/** Where the built MCP server lives, in development and once packaged. */
function serverPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'mcp', 'server.mjs')
    : path.join(__dirname, '..', 'mcp', 'dist', 'server.mjs');
}

async function saveFile(name, bytes) {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), name),
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, Buffer.from(bytes));
  return true;
}

/**
 * Plugs A+ Write into Claude Desktop.
 *
 * Asks first, backs the existing file up, and refuses to touch a config it
 * cannot parse — see claudeConfig.cjs for why each of those matters.
 */
async function setupClaude() {
  const target = claude.configPath(process.platform, process.env, os.homedir());
  const server = serverPath();

  if (!fs.existsSync(server)) {
    await dialog.showMessageBox(win, {
      type: 'error',
      message: say('MCP-servern är inte byggd än', 'The MCP server is not built yet'),
      detail: say('Kör  npm run mcp:build  i projektmappen och försök igen.', 'Run  npm run mcp:build  in the project folder and try again.'),
    });
    return { ok: false, reason: 'not-built' };
  }

  const picked = await dialog.showOpenDialog(win, {
    title: say('Var ligger dina manus?', 'Where are your scripts?'),
    message: say('Claude får läsa och kommentera .fountain-filer i den här mappen.', 'Claude may read and annotate .fountain files in this folder.'),
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || !picked.filePaths[0]) return { ok: false, reason: 'canceled' };
  const options = { serverPath: server, scriptsDirs: [picked.filePaths[0]] };

  let text = '';
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }

  const parsed = claude.parseConfig(text);
  if (!parsed.ok) {
    await dialog.showMessageBox(win, {
      type: 'error',
      message: say('Claude Desktops konfigurationsfil går inte att läsa', 'Claude Desktop\'s config file cannot be read'),
      detail: say(
        `Filen ser trasig ut, så jag rör den inte:\n${target}\n\nRätta den eller ta bort den och försök igen.`,
        `The file looks broken, so I am not touching it:\n${target}\n\nFix or remove it and try again.`,
      ),
    });
    return { ok: false, reason: 'unreadable' };
  }

  if (claude.isInstalled(parsed.config, options)) {
    await dialog.showMessageBox(win, { message: say('Redan kopplad. Starta om Claude Desktop om du inte ser verktygen.', 'Already connected. Restart Claude Desktop if you do not see the tools.') });
    return { ok: true, changed: false };
  }

  const answer = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: [say('Koppla in', 'Connect'), say('Avbryt', 'Cancel')],
    defaultId: 0,
    cancelId: 1,
    message: say('Koppla in A+ Write i Claude Desktop?', 'Connect A+ Write to Claude Desktop?'),
    detail: say(
      `Jag lägger till A+ Write i:\n${target}\n\nAndra servrar lämnas orörda och en säkerhetskopia sparas bredvid.`,
      `I will add A+ Write to:\n${target}\n\nOther servers are left untouched and a backup is saved next to it.`,
    ),
  });
  if (answer.response !== 0) return { ok: false, reason: 'canceled' };

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (text) fs.writeFileSync(`${target}.aplus-backup`, text);
  fs.writeFileSync(target, claude.serialize(claude.withServer(parsed.config, options)));

  await dialog.showMessageBox(win, {
    message: say('Klart. Starta om Claude Desktop.', 'Done. Restart Claude Desktop.'),
    detail: say('Sedan hittar du A+ Write under verktygen och som färdiga kommandon.', 'Then A+ Write shows up under tools and as ready-made commands.'),
  });
  return { ok: true, changed: true };
}

/* ------------------------------------------------------------------- menu */

function buildMenu() {
  const mac = process.platform === 'darwin';
  const template = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Claude',
      submenu: [{ label: say('Koppla in Claude Desktop …', 'Connect Claude Desktop …'), click: () => void setupClaude() }],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* -------------------------------------------------------------------- app */

// One window is plenty, and two would fight over the same local files.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  ipcMain.handle('aplus:bridgeInfo', () => bridgeInfo());
  ipcMain.handle('aplus:saveFile', (_event, name, bytes) => saveFile(String(name), bytes));
  ipcMain.handle('aplus:setupClaude', () => setupClaude());

  app.whenReady().then(() => {
    buildMenu();
    createWindow();

    // `APLUS_SMOKE=1` is for checking the shell without a person: load the
    // page, report what the preload exposed, and quit.
    if (process.env.APLUS_SMOKE) {
      win.webContents.once('did-finish-load', async () => {
        const report = await win.webContents.executeJavaScript(
          `JSON.stringify({ title: document.title, desktop: window.__APLUS_DESKTOP__ === true, api: Object.keys(window.aplusDesktop || {}), platform: window.aplusDesktop && window.aplusDesktop.platform })`,
        );
        process.stdout.write(`SMOKE ${report}\n`);
        app.quit();
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

void isDev;
