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

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-()（）]/g, "");
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDateCell(value) {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { ok: true, value: formatDate(value) };
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return { ok: false };
    return { ok: true, value: `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` };
  }
  const raw = String(value).trim();
  if (!raw) return { ok: true, value: null };
  const normalized = raw.replace(/[./]/g, "-");
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) return { ok: false };
  const [y, m, d] = normalized.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return { ok: false };
  return { ok: true, value: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

function buildVehicleImportPreview(rows, filePath, sheetName, existingVehicles) {
  const aliases = {
    vehicle_no: ["车辆编号", "车编号", "vehicle_no", "vehicleno", "编号"],
    plate_no: ["车牌号", "车牌", "plate_no", "plateno"],
    vehicle_model: ["车型", "车辆类型", "vehicle_model", "model"],
    owner_name: ["负责人", "责任人", "owner_name", "owner"],
    owner_phone: ["负责人电话", "联系电话", "手机号", "owner_phone", "phone", "tel"],
    purchase_date: ["购买日期", "购置日期", "purchase_date"],
    note: ["备注", "说明", "note"]
  };
  const headerRow = (rows[0] || []).map((v) => String(v || "").trim());
  const indexMap = {};
  const normalizedHeaders = headerRow.map((h) => normalizeHeader(h));
  for (const [field, names] of Object.entries(aliases)) {
    const normalizedNames = names.map(normalizeHeader);
    const idx = normalizedHeaders.findIndex((h) => normalizedNames.includes(h));
    if (idx >= 0) indexMap[field] = idx;
  }

  const requiredFields = ["vehicle_no", "plate_no", "vehicle_model", "owner_name"];
  const missingHeaders = requiredFields.filter((field) => indexMap[field] === undefined);
  if (missingHeaders.length > 0) {
    const mapLabel = {
      vehicle_no: "车辆编号",
      plate_no: "车牌号",
      vehicle_model: "车型",
      owner_name: "负责人"
    };
    return {
      canceled: false,
      file_path: filePath,
      file_name: path.basename(filePath),
      sheet_name: sheetName,
      header_map: indexMap,
      summary: { total_rows: Math.max(rows.length - 1, 0), valid_count: 0, skipped_count: 0, failed_count: 1 },
      candidates: [],
      skipped: [],
      failed: [{ line_no: 1, reason: `缺少必要表头：${missingHeaders.map((f) => mapLabel[f]).join("、")}` }]
    };
  }

  const existingNo = new Set(existingVehicles.map((v) => String(v.vehicle_no)));
  const existingPlate = new Set(existingVehicles.map((v) => String(v.plate_no)));
  const seenNo = new Set();
  const seenPlate = new Set();
  const candidates = [];
  const skipped = [];
  const failed = [];

  for (let i = 1; i < rows.length; i += 1) {
    const lineNo = i + 1;
    const row = rows[i] || [];
    const getRaw = (field) => {
      const idx = indexMap[field];
      if (idx === undefined) return "";
      const cell = row[idx];
      return cell === null || cell === undefined ? "" : String(cell).trim();
    };

    const vehicleNo = getRaw("vehicle_no");
    const plateNo = getRaw("plate_no");
    const vehicleModel = getRaw("vehicle_model");
    const ownerName = getRaw("owner_name");
    const ownerPhone = getRaw("owner_phone");
    const note = getRaw("note");

    if (!vehicleNo && !plateNo && !vehicleModel && !ownerName) continue;

    if (!vehicleNo) {
      failed.push({ line_no: lineNo, reason: "车辆编号为空", vehicle_no: "", plate_no: plateNo });
      continue;
    }
    if (!plateNo) {
      failed.push({ line_no: lineNo, reason: "车牌号为空", vehicle_no: vehicleNo, plate_no: "" });
      continue;
    }
    if (!vehicleModel) {
      failed.push({ line_no: lineNo, reason: "车型为空", vehicle_no: vehicleNo, plate_no: plateNo });
      continue;
    }
    if (!ownerName) {
      failed.push({ line_no: lineNo, reason: "负责人为空", vehicle_no: vehicleNo, plate_no: plateNo });
      continue;
    }
    if (ownerPhone && !/^1\d{10}$/.test(ownerPhone) && !/^\d{3,4}-?\d{7,8}$/.test(ownerPhone)) {
      failed.push({ line_no: lineNo, reason: "负责人电话格式错误", vehicle_no: vehicleNo, plate_no: plateNo });
      continue;
    }

    const dateCell = indexMap.purchase_date === undefined ? null : row[indexMap.purchase_date];
    const normalizedDate = normalizeDateCell(dateCell);
    if (!normalizedDate.ok) {
      failed.push({ line_no: lineNo, reason: "日期格式错误", vehicle_no: vehicleNo, plate_no: plateNo });
      continue;
    }

    if (seenNo.has(vehicleNo) || seenPlate.has(plateNo)) {
      skipped.push({ line_no: lineNo, reason: "Excel内重复：车辆编号或车牌号重复", vehicle_no: vehicleNo, plate_no: plateNo });
      continue;
    }
    if (existingNo.has(vehicleNo) || existingPlate.has(plateNo)) {
      skipped.push({ line_no: lineNo, reason: "唯一冲突：车辆编号或车牌号已存在", vehicle_no: vehicleNo, plate_no: plateNo });
      continue;
    }

    seenNo.add(vehicleNo);
    seenPlate.add(plateNo);
    candidates.push({
      line_no: lineNo,
      payload: {
        vehicle_no: vehicleNo,
        plate_no: plateNo,
        vehicle_model: vehicleModel,
        owner_name: ownerName,
        owner_phone: ownerPhone,
        purchase_date: normalizedDate.value,
        note
      }
    });
  }

  return {
    canceled: false,
    file_path: filePath,
    file_name: path.basename(filePath),
    sheet_name: sheetName,
    header_map: indexMap,
    summary: {
      total_rows: Math.max(rows.length - 1, 0),
      valid_count: candidates.length,
      skipped_count: skipped.length,
      failed_count: failed.length
    },
    candidates,
    skipped,
    failed
  };
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
  ipcMain.handle("vehicles:import-preview", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择车辆导入 Excel",
      properties: ["openFile"],
      filters: [{ name: "Excel 文件", extensions: ["xlsx", "xls"] }]
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) return { canceled: true };
    const filePath = result.filePaths[0];
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true
    });
    const existingVehicles = db.listVehicles();
    return buildVehicleImportPreview(rows, filePath, firstSheetName, existingVehicles);
  });
  ipcMain.handle("vehicles:import-apply", async (_, candidates) => db.bulkImportVehicles(candidates || []));

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
