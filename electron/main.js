// Proces główny Electron — uruchamia zbudowaną aplikację Next.js jako
// lokalny serwer i otwiera go w oknie desktopowym. Baza danych (SQLite)
// trzymana jest w katalogu danych użytkownika, więc dane przetrwają
// aktualizacje aplikacji.

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

const PORT = 4317;
const isDev = !app.isPackaged;

// W trybie deweloperskim (po `npm run build:electron`) serwer standalone
// leży w .next/standalone w katalogu projektu. Po spakowaniu
// (electron-builder) leży w resources/app (extraResources).
const appRoot = isDev
  ? path.join(__dirname, "..", ".next", "standalone")
  : path.join(process.resourcesPath, "app");

let serverProcess = null;
let mainWindow = null;

function resolveDbPath() {
  const userDataDir = app.getPath("userData");
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  const dbPath = path.join(userDataDir, "monitoring.db");

  if (!fs.existsSync(dbPath)) {
    const templatePath = isDev
      ? path.join(__dirname, "resources", "template.db")
      : path.join(process.resourcesPath, "template.db");
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, dbPath);
    } else {
      console.warn(`Brak pliku szablonu bazy: ${templatePath}`);
    }
  }

  return dbPath;
}

function waitForServer(port, timeoutMs = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1500 }, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Serwer aplikacji nie odpowiedział na czas."));
        } else {
          setTimeout(attempt, 400);
        }
      });
    };
    attempt();
  });
}

function startServer() {
  const dbPath = resolveDbPath();
  const serverScript = path.join(appRoot, "server.js");

  if (!fs.existsSync(serverScript)) {
    throw new Error(
      `Nie znaleziono ${serverScript}. Uruchom najpierw "npm run build:electron".`,
    );
  }

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: `file:${dbPath}`,
    },
    stdio: "pipe",
  });

  serverProcess.stdout?.on("data", (d) => process.stdout.write(`[next] ${d}`));
  serverProcess.stderr?.on("data", (d) => process.stderr.write(`[next] ${d}`));

  serverProcess.on("exit", (code) => {
    if (code !== 0 && mainWindow) {
      console.error(`Serwer aplikacji zakończył się kodem ${code}`);
    }
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Trinity Trust — Monitoring Legislacyjny",
    backgroundColor: "#fafaf9",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Linki zewnętrzne (np. "Zobacz źródło") otwierają się w domyślnej przeglądarce.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    await waitForServer(PORT);
    await mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  } catch (err) {
    mainWindow.loadURL(
      `data:text/html,<h1 style="font-family:sans-serif">Błąd uruchomienia</h1><p style="font-family:sans-serif">${encodeURIComponent(
        String(err),
      )}</p>`,
    );
  }
}

app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
