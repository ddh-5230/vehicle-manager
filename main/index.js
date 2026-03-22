const path = require("path");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const XLSX = require("xlsx");
const db = require("./db");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1080,
    minHeight: 760,
    backgroundColor: "#f8f4e8",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function registerHandlers() {
  ipcMain.handle("dashboard:get", async () => db.getDashboardData());
  ipcMain.handle("reminders:consume", async () => db.consumeDueReminders());

  ipcMain.handle("vehicles:list", async () => db.listVehicles());
  ipcMain.handle("vehicles:detail", async (_, vehicleId) => db.getVehicleDetail(toNumber(vehicleId)));
  ipcMain.handle("vehicles:create", async (_, payload) => db.createVehicle(payload));
  ipcMain.handle("vehicles:update", async (_, vehicleId, payload) => db.updateVehicle(toNumber(vehicleId), payload));
  ipcMain.handle("vehicles:copy", async (_, sourceVehicleId, payload) => db.copyVehicle(toNumber(sourceVehicleId), payload));
  ipcMain.handle("vehicles:delete", async (_, vehicleId) => db.deleteVehicle(toNumber(vehicleId)));

  ipcMain.handle("items:list", async () => db.listItems());
  ipcMain.handle("items:create", async (_, payload) => db.createItem(payload));
  ipcMain.handle("items:update", async (_, itemId, payload) => db.updateItem(toNumber(itemId), payload));
  ipcMain.handle("items:delete", async (_, itemId) => db.deleteItem(toNumber(itemId)));
  ipcMain.handle("vehicle-item:add", async (_, vehicleId, itemId) =>
    db.addVehicleItem(toNumber(vehicleId), toNumber(itemId))
  );
  ipcMain.handle("vehicle-items:add", async (_, vehicleId, itemId) =>
    db.addVehicleItem(toNumber(vehicleId), toNumber(itemId))
  );
  ipcMain.handle("vehicle-item:delete", async (_, vehicleId, itemId) =>
    db.removeVehicleItem(toNumber(vehicleId), toNumber(itemId))
  );
  ipcMain.handle("vehicle-items:delete", async (_, vehicleId, itemId) =>
    db.removeVehicleItem(toNumber(vehicleId), toNumber(itemId))
  );

  ipcMain.handle("records:list", async (_, filters) => db.listRecords(filters || {}));
  ipcMain.handle("records:create", async (_, payload) => db.createRecord(payload));
  ipcMain.handle("records:update", async (_, recordId, payload) => db.updateRecord(toNumber(recordId), payload));
  ipcMain.handle("records:delete", async (_, recordId) => db.deleteRecord(toNumber(recordId)));

  ipcMain.handle("queries:due", async (_, filters) => db.listDueEntries(filters || {}));

  ipcMain.handle("export:data", async (_, filters) => {
    const rows = db.getExportRows(filters || {});
    const defaultName =
      filters && filters.export_type === "due"
        ? `车辆到期数据_${new Date().toISOString().slice(0, 10)}.xlsx`
        : `车辆检查记录_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出 Excel",
      defaultPath: path.join(app.getPath("documents"), defaultName),
      filters: [{ name: "Excel 文件", extensions: ["xlsx"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "导出数据");
    XLSX.writeFile(wb, result.filePath);
    return { ok: true, path: result.filePath, count: rows.length };
  });
}

function handleErrors() {
  process.on("uncaughtException", (error) => {
    dialog.showErrorBox("系统错误", String(error && error.message ? error.message : error));
  });

  process.on("unhandledRejection", (reason) => {
    dialog.showErrorBox("系统错误", String(reason));
  });
}

app.whenReady().then(async () => {
  await db.initDatabase(app.getPath("userData"));
  handleErrors();
  registerHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
