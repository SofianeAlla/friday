// Minimal, safe bridge: exposes only what the renderer needs to know it's
// running inside the Friday desktop app and to request a desktop shortcut.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("friday", {
  isDesktop: true,
  platform: process.platform,
  createDesktopShortcut: () => ipcRenderer.invoke("friday:create-desktop-shortcut"),
});
