// Friday desktop shell. Electron starts the bundled backend as a Node child
// (ELECTRON_RUN_AS_NODE) on a free port with app data in userData, waits for it
// to answer, then loads the window at that origin so the frontend's relative
// /api calls + SSE just work. No separate web server, no CORS.

const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");

let serverProc = null;
let serverPort = 0;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/state", timeout: 2000 }, (res) => { res.resume(); resolve(); });
      const retry = () => { if (Date.now() > deadline) reject(new Error("backend did not start in time")); else setTimeout(tick, 300); };
      req.on("error", retry);
      req.on("timeout", () => { req.destroy(); retry(); });
    };
    tick();
  });
}

async function startServer() {
  const appRoot = app.getAppPath();
  serverPort = await findFreePort();
  const serverEntry = path.join(appRoot, "build", "server.mjs");
  const webDist = path.join(appRoot, "web", "dist");
  const fridayHome = path.join(app.getPath("userData"), ".friday");

  serverProc = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(serverPort),
      FRIDAY_HOME: fridayHome,
      FRIDAY_WEB_DIST: webDist,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => console.log("[friday-server]", String(d).trim()));
  serverProc.stderr.on("data", (d) => console.error("[friday-server]", String(d).trim()));
  serverProc.on("exit", (code) => { if (code) console.error(`[friday-server] exited ${code}`); });

  await waitForServer(serverPort, 30000);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#17130f",
    title: "Friday",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // External links open in the real browser (e.g. "Get a key", git-scm).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(`http://127.0.0.1:${serverPort}`);
}

function killServer() {
  if (serverProc && !serverProc.killed) { try { serverProc.kill(); } catch { /* noop */ } }
  serverProc = null;
}

app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
  } catch (e) {
    dialog.showErrorBox("Friday failed to start", String((e && e.message) || e));
    app.quit();
  }
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { killServer(); if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", killServer);
app.on("quit", killServer);
