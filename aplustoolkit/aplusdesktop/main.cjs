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
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const claude = require('./claudeConfig.cjs');

const sv = (app.getLocale() || 'en').toLowerCase().startsWith('sv');
const say = (swedish, english) => (sv ? swedish : english);

let win = null;
let server = null;
/** Where the app is being served from. Set before the window opens. */
let appUrl = process.env.APLUS_URL || 'http://localhost:3000';

/* ------------------------------------------------------------ the server */

/**
 * The web app that ships inside the installer, if it is there.
 *
 * Built by `npm run desktop:build` into aplusdesktop/bundle, and copied into
 * the installer's resources. Missing in a checkout that has not built it,
 * which is the normal case while developing: then the shell points at the dev
 * server instead.
 */
function bundle() {
  const base = app.isPackaged ? path.join(process.resourcesPath, 'bundle') : path.join(__dirname, 'bundle');
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'aplus-app.json'), 'utf8'));
    const entry = path.join(base, manifest.server);
    if (!fs.existsSync(entry)) return null;
    return {
      base,
      entry,
      mcp: path.join(base, manifest.mcp),
      modules: manifest.modules ? path.join(base, manifest.modules) : null,
    };
  } catch {
    return null;
  }
}

/** A port the OS says is free right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function reachable(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });
    request.setTimeout(1000, () => request.destroy());
    request.once('error', () => resolve(false));
  });
}

/**
 * Starts the bundled Next server on a loopback port.
 *
 * Run through Electron's own binary with ELECTRON_RUN_AS_NODE, so the writer
 * does not need Node installed — the whole point of shipping an installer.
 */
async function startServer(found) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, [found.entry], {
    cwd: path.dirname(found.entry),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      // The dependency tree ships under a name electron-builder will carry;
      // this is what lets `require('next')` find it. See build-desktop.mjs.
      ...(found.modules ? { NODE_PATH: found.modules } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  // Without this, a server that dies on startup says nothing at all.
  let complaint = '';
  const listen = (stream) => stream?.on('data', (chunk) => { complaint += chunk.toString().slice(0, 400); });
  listen(server.stderr);
  listen(server.stdout);

  server.on('exit', () => {
    server = null;
  });

  // Next is ready in well under a second, but a cold disk on a slow machine
  // is a different story. Give it room rather than showing an error page.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (!server) throw new Error(`the bundled server stopped while starting. ${complaint.trim()}`);
    if (await reachable(url)) return url;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('the bundled server did not answer in time');
}

function stopServer() {
  if (!server) return;
  const running = server;
  server = null;
  running.kill();
}

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
    if (new URL(url).origin !== new URL(appUrl).origin) {
      event.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });

  void win.loadURL(appUrl).catch(() => {
    void win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<body style="font:15px system-ui;background:#131317;color:#f4f2ec;display:grid;place-items:center;height:100vh;margin:0">` +
            `<div style="max-width:420px"><h2>${say('Kunde inte nå A+ Write', 'Could not reach A+ Write')}</h2>` +
            `<p style="color:#9a9aa4;line-height:1.5">${say(
              'Starta webbappen med <code>npm run dev</code> och försök igen.',
              'Start the web app with <code>npm run dev</code> and try again.',
            )}</p><p style="color:#6a6a74">${appUrl}</p></div></body>`,
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

/** Where the built MCP server lives: in the bundle if there is one, else the checkout. */
function serverPath() {
  const found = bundle();
  if (found && fs.existsSync(found.mcp)) return found.mcp;
  return path.join(__dirname, '..', 'mcp', 'dist', 'server.mjs');
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

/* ----------------------------------------------------------------- updates */

/**
 * Keeping the app up to date without getting in the way.
 *
 * An update downloads quietly in the background and is installed the next
 * time the app is closed — a writer mid-scene should never be asked to
 * restart. The only dialogs are the ones that answer a question the writer
 * asked themselves, from the menu.
 *
 * APLUS_UPDATE_URL points the updater at a plain static folder instead of
 * GitHub. That is what makes the whole path testable without cutting a
 * release: see docs/electron.md.
 */
let updateReady = false;

function updates() {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  if (process.env.APLUS_UPDATE_URL) {
    autoUpdater.setFeedURL({ provider: 'generic', url: process.env.APLUS_UPDATE_URL });
  }
  return autoUpdater;
}

function watchForUpdates() {
  // A checkout has no installer to replace, and electron-updater says so
  // loudly. Nothing to do until the app is packaged.
  if (!app.isPackaged && !process.env.APLUS_UPDATE_URL) return;

  const autoUpdater = updates();

  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    const version = (info && info.version) || '';
    process.stdout.write(`APLUS_UPDATE_DOWNLOADED ${version}\n`);
    buildMenu();
    // Asked for by a test harness, never in normal use: restart immediately
    // so the update can be verified end to end.
    if (process.env.APLUS_UPDATE_TEST) setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });

  autoUpdater.on('error', (error) => {
    process.stdout.write(`APLUS_UPDATE_ERROR ${error && error.message}\n`);
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => undefined);
  void check();
  const timer = setInterval(check, 4 * 60 * 60 * 1000);
  app.on('before-quit', () => clearInterval(timer));
}

/** The menu item: only here does an update ever open a dialog. */
async function checkForUpdatesNow() {
  if (updateReady) {
    const answer = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: [say('Starta om nu', 'Restart now'), say('Senare', 'Later')],
      defaultId: 0,
      cancelId: 1,
      message: say('Uppdateringen är klar', 'The update is ready'),
      detail: say('Den läggs in när du stänger appen, eller nu om du vill.', 'It is applied when you close the app, or now if you prefer.'),
    });
    if (answer.response === 0) updates().quitAndInstall(true, true);
    return;
  }

  if (!app.isPackaged && !process.env.APLUS_UPDATE_URL) {
    await dialog.showMessageBox(win, {
      message: say('Uppdateringar gäller den installerade appen', 'Updates apply to the installed app'),
      detail: say('Du kör från en utvecklingskopia.', 'You are running from a checkout.'),
    });
    return;
  }

  try {
    const result = await updates().checkForUpdates();
    const version = result && result.updateInfo && result.updateInfo.version;
    await dialog.showMessageBox(win, {
      message:
        version && version !== app.getVersion()
          ? say(`Hämtar version ${version} …`, `Downloading version ${version} …`)
          : say('Du har den senaste versionen.', 'You are up to date.'),
      detail: say(`Den här appen är version ${app.getVersion()}.`, `This app is version ${app.getVersion()}.`),
    });
  } catch (error) {
    await dialog.showMessageBox(win, {
      type: 'error',
      message: say('Kunde inte leta efter uppdateringar', 'Could not check for updates'),
      detail: (error && error.message) || '',
    });
  }
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
    {
      label: say('Hjälp', 'Help'),
      submenu: [
        { label: `A+ Toolkit ${app.getVersion()}`, enabled: false },
        updateReady
          ? { label: say('Starta om för att uppdatera', 'Restart to update'), click: () => void checkForUpdatesNow() }
          : { label: say('Sök efter uppdateringar …', 'Check for updates …'), click: () => void checkForUpdatesNow() },
      ],
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

  app.on('before-quit', stopServer);
  app.on('will-quit', stopServer);
  process.on('exit', stopServer);

  app.whenReady().then(async () => {
    buildMenu();

    /* A bundled app serves itself, so the window works with no dev server and
       no internet. APLUS_URL always wins, because that is how you point the
       shell at something you are working on. */
    if (!process.env.APLUS_URL) {
      const found = bundle();
      if (found) {
        try {
          appUrl = await startServer(found);
        } catch (error) {
          console.error('could not start the bundled server:', error && error.message);
        }
      }
    }

    createWindow();
    watchForUpdates();

    // `APLUS_SMOKE=1` is for checking the shell without a person: load the
    // page, report what it found and what the preload exposed, and quit.
    if (process.env.APLUS_SMOKE) {
      win.webContents.once('did-finish-load', async () => {
        const page = await win.webContents.executeJavaScript(
          `JSON.stringify({ title: document.title, desktop: window.__APLUS_DESKTOP__ === true, api: Object.keys(window.aplusDesktop || {}), platform: window.aplusDesktop && window.aplusDesktop.platform, headings: [...document.querySelectorAll('h1,h2')].map((h) => h.textContent).slice(0, 3) })`,
        );
        const report = { ...JSON.parse(page), url: appUrl, bundled: server !== null, mcp: fs.existsSync(serverPath()) };
        process.stdout.write(`SMOKE ${JSON.stringify(report)}\n`);
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
