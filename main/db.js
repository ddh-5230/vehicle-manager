const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const DB_NAME = "vehicle_manager.db";

const DEFAULT_ITEMS = [
  { name: "车辆二级维护", cycle_value: 4, cycle_unit: "month" },
  { name: "压力表", cycle_value: 6, cycle_unit: "month" },
  { name: "车辆年审", cycle_value: 1, cycle_unit: "year" },
  { name: "罐检", cycle_value: 1, cycle_unit: "year" },
  { name: "保险", cycle_value: 1, cycle_unit: "year" },
  { name: "营运证", cycle_value: 1, cycle_unit: "year" },
  { name: "气瓶安全阀", cycle_value: 1, cycle_unit: "year" },
  { name: "车载气瓶", cycle_value: 3, cycle_unit: "year" },
  { name: "从业资格", cycle_value: 6, cycle_unit: "year" },
  { name: "驾照", cycle_value: 10, cycle_unit: "year" }
];

let SQL = null;
let db = null;
let dbPath = "";

function nowIso() {
  return new Date().toISOString();
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return formatDate(new Date());
}

function addDays(dateStr, days) {
  const base = parseDate(dateStr);
  if (!base) return null;
  base.setDate(base.getDate() + days);
  return formatDate(base);
}

function addCycle(dateStr, value, unit) {
  const base = parseDate(dateStr);
  if (!base) return null;
  if (unit === "day") base.setDate(base.getDate() + value);
  if (unit === "month") base.setMonth(base.getMonth() + value);
  if (unit === "year") base.setFullYear(base.getFullYear() + value);
  return formatDate(base);
}

function daysBetween(a, b) {
  const da = parseDate(a);
  const dbDate = parseDate(b);
  if (!da || !dbDate) return null;
  return Math.floor((da.getTime() - dbDate.getTime()) / 86400000);
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function one(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
}

function saveDb() {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function write(sql, params = []) {
  run(sql, params);
  saveDb();
}

function tx(fn) {
  run("BEGIN");
  try {
    const result = fn();
    run("COMMIT");
    saveDb();
    return result;
  } catch (error) {
    run("ROLLBACK");
    throw error;
  }
}

function lastInsertId() {
  const row = one("SELECT last_insert_rowid() AS id");
  return Number(row.id);
}

function ensureSchema() {
  run("PRAGMA foreign_keys = ON");
  run(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_no TEXT NOT NULL UNIQUE,
      plate_no TEXT NOT NULL UNIQUE,
      vehicle_model TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      owner_phone TEXT,
      purchase_date TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS inspection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      cycle_value INTEGER NOT NULL,
      cycle_unit TEXT NOT NULL CHECK(cycle_unit IN ('day', 'month', 'year')),
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS vehicle_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      last_check_date TEXT,
      next_due_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(vehicle_id, item_id),
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES inspection_items(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS inspection_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      check_date TEXT NOT NULL,
      result TEXT NOT NULL CHECK(result IN ('pass', 'fail')),
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES inspection_items(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS reminder_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      reminder_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('upcoming', 'overdue')),
      created_at TEXT NOT NULL,
      UNIQUE(vehicle_id, item_id, reminder_date),
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES inspection_items(id) ON DELETE CASCADE
    )
  `);

  run("CREATE INDEX IF NOT EXISTS idx_records_vehicle_item_date ON inspection_records(vehicle_id, item_id, check_date)");
  run("CREATE INDEX IF NOT EXISTS idx_vehicle_items_due_date ON vehicle_items(next_due_date)");
  run("CREATE INDEX IF NOT EXISTS idx_reminder_logs_date ON reminder_logs(reminder_date)");

  const vehicleColumns = all("PRAGMA table_info(vehicles)");
  const hasOwnerPhone = vehicleColumns.some((col) => col.name === "owner_phone");
  if (!hasOwnerPhone) {
    run("ALTER TABLE vehicles ADD COLUMN owner_phone TEXT");
  }
}

function seedDefaultItems() {
  const count = one("SELECT COUNT(*) AS c FROM inspection_items");
  if (Number(count.c) > 0) return;
  const now = nowIso();
  for (const item of DEFAULT_ITEMS) {
    run(
      `INSERT INTO inspection_items(name, cycle_value, cycle_unit, enabled, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [item.name, item.cycle_value, item.cycle_unit, now, now]
    );
  }
}

async function initDatabase(userDataPath) {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, "..", "node_modules", "sql.js", "dist", file)
  });
  dbPath = path.join(userDataPath, DB_NAME);
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  ensureSchema();
  seedDefaultItems();
  saveDb();
}

function getVehicleById(vehicleId) {
  return one("SELECT * FROM vehicles WHERE id = ?", [vehicleId]);
}

function getItemById(itemId) {
  return one("SELECT * FROM inspection_items WHERE id = ?", [itemId]);
}

function recalcVehicleItemSchedule(vehicleId, itemId) {
  const item = getItemById(itemId);
  const vehicle = getVehicleById(vehicleId);
  if (!item || !vehicle) return;
  const latest = one(
    `SELECT check_date FROM inspection_records
     WHERE vehicle_id = ? AND item_id = ?
     ORDER BY check_date DESC, id DESC LIMIT 1`,
    [vehicleId, itemId]
  );

  const baseDate = latest ? latest.check_date : vehicle.purchase_date;
  const nextDue = baseDate ? addCycle(baseDate, Number(item.cycle_value), item.cycle_unit) : null;
  const now = nowIso();
  run(
    `UPDATE vehicle_items SET last_check_date = ?, next_due_date = ?, updated_at = ?
     WHERE vehicle_id = ? AND item_id = ?`,
    [latest ? latest.check_date : null, nextDue, now, vehicleId, itemId]
  );
  run("DELETE FROM reminder_logs WHERE vehicle_id = ? AND item_id = ?", [vehicleId, itemId]);
}

function bindVehicleEnabledItems(vehicleId, purchaseDate) {
  const now = nowIso();
  const enabledItems = all("SELECT * FROM inspection_items WHERE enabled = 1 ORDER BY id");
  for (const item of enabledItems) {
    const nextDue = purchaseDate ? addCycle(purchaseDate, Number(item.cycle_value), item.cycle_unit) : null;
    run(
      `INSERT OR IGNORE INTO vehicle_items(vehicle_id, item_id, last_check_date, next_due_date, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?)`,
      [vehicleId, item.id, nextDue, now, now]
    );
  }
}

function validatePhone(phone) {
  if (!phone) return true;
  const normalized = String(phone).trim();
  if (!normalized) return true;
  return /^1\d{10}$/.test(normalized) || /^\d{3,4}-?\d{7,8}$/.test(normalized);
}

function hasVehicleConflict(vehicleNo, plateNo) {
  const row = one(
    `SELECT id FROM vehicles WHERE vehicle_no = ? OR plate_no = ? LIMIT 1`,
    [vehicleNo, plateNo]
  );
  return Boolean(row);
}

function bulkImportVehicles(candidates = []) {
  return tx(() => {
    const success = [];
    const skipped = [];
    const failed = [];
    const seenNo = new Set();
    const seenPlate = new Set();

    for (const row of candidates) {
      const payload = row && row.payload ? row.payload : row;
      const lineNo = row && row.line_no ? row.line_no : 0;
      const vehicleNo = String(payload.vehicle_no || "").trim();
      const plateNo = String(payload.plate_no || "").trim();
      const vehicleModel = String(payload.vehicle_model || "").trim();
      const ownerName = String(payload.owner_name || "").trim();
      const ownerPhone = String(payload.owner_phone || "").trim();

      if (!vehicleNo || !plateNo || !vehicleModel || !ownerName) {
        failed.push({ line_no: lineNo, reason: "必填字段缺失", vehicle_no: vehicleNo, plate_no: plateNo });
        continue;
      }
      if (!validatePhone(ownerPhone)) {
        failed.push({ line_no: lineNo, reason: "负责人电话格式错误", vehicle_no: vehicleNo, plate_no: plateNo });
        continue;
      }

      if (seenNo.has(vehicleNo) || seenPlate.has(plateNo)) {
        skipped.push({ line_no: lineNo, reason: "Excel内重复：车辆编号或车牌号重复", vehicle_no: vehicleNo, plate_no: plateNo });
        continue;
      }

      if (hasVehicleConflict(vehicleNo, plateNo)) {
        skipped.push({ line_no: lineNo, reason: "唯一冲突：车辆编号或车牌号已存在", vehicle_no: vehicleNo, plate_no: plateNo });
        continue;
      }

      const now = nowIso();
      run(
        `INSERT INTO vehicles(vehicle_no, plate_no, vehicle_model, owner_name, owner_phone, purchase_date, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vehicleNo,
          plateNo,
          vehicleModel,
          ownerName,
          ownerPhone,
          payload.purchase_date || null,
          payload.note || "",
          now,
          now
        ]
      );
      const vehicleId = lastInsertId();
      bindVehicleEnabledItems(vehicleId, payload.purchase_date || null);
      seenNo.add(vehicleNo);
      seenPlate.add(plateNo);
      success.push({ line_no: lineNo, vehicle_no: vehicleNo, plate_no: plateNo });
    }

    return {
      success_count: success.length,
      skipped_count: skipped.length,
      failed_count: failed.length,
      success,
      skipped,
      failed
    };
  });
}

function listVehicles() {
  const today = todayStr();
  const in7 = addDays(today, 7);
  return all(
    `SELECT
      v.*,
      (SELECT COUNT(*) FROM vehicle_items vi WHERE vi.vehicle_id = v.id) AS item_count,
      (SELECT COUNT(*) FROM vehicle_items vi
       JOIN inspection_items ii ON ii.id = vi.item_id
       WHERE vi.vehicle_id = v.id AND ii.enabled = 1 AND vi.next_due_date < ?) AS overdue_count,
      (SELECT COUNT(*) FROM vehicle_items vi
       JOIN inspection_items ii ON ii.id = vi.item_id
       WHERE vi.vehicle_id = v.id AND ii.enabled = 1 AND vi.next_due_date BETWEEN ? AND ?) AS upcoming_count
     FROM vehicles v
     ORDER BY v.vehicle_no`,
    [today, today, in7]
  );
}

function getVehicleDetail(vehicleId) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) return null;
  const today = todayStr();
  const items = all(
    `SELECT
      vi.id,
      vi.vehicle_id,
      vi.item_id,
      vi.last_check_date,
      vi.next_due_date,
      ii.name AS item_name,
      ii.cycle_value,
      ii.cycle_unit,
      ii.enabled,
      CASE
        WHEN vi.next_due_date IS NULL THEN 'no_due'
        WHEN vi.next_due_date < ? THEN 'overdue'
        WHEN vi.next_due_date <= date(?, '+7 day') THEN 'upcoming'
        ELSE 'normal'
      END AS due_status
     FROM vehicle_items vi
     JOIN inspection_items ii ON ii.id = vi.item_id
     WHERE vi.vehicle_id = ?
     ORDER BY ii.name`,
    [today, today, vehicleId]
  );
  return { vehicle, items };
}

function createVehicle(payload) {
  return tx(() => {
    const now = nowIso();
    run(
      `INSERT INTO vehicles(vehicle_no, plate_no, vehicle_model, owner_name, owner_phone, purchase_date, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.vehicle_no,
        payload.plate_no,
        payload.vehicle_model,
        payload.owner_name,
        payload.owner_phone || "",
        payload.purchase_date || null,
        payload.note || "",
        now,
        now
      ]
    );
    const vehicleId = lastInsertId();
    bindVehicleEnabledItems(vehicleId, payload.purchase_date || null);
    return getVehicleDetail(vehicleId);
  });
}

function updateVehicle(vehicleId, payload) {
  return tx(() => {
    const now = nowIso();
    run(
      `UPDATE vehicles
       SET vehicle_no = ?, plate_no = ?, vehicle_model = ?, owner_name = ?, owner_phone = ?, purchase_date = ?, note = ?, updated_at = ?
       WHERE id = ?`,
      [
        payload.vehicle_no,
        payload.plate_no,
        payload.vehicle_model,
        payload.owner_name,
        payload.owner_phone || "",
        payload.purchase_date || null,
        payload.note || "",
        now,
        vehicleId
      ]
    );

    const linked = all("SELECT item_id FROM vehicle_items WHERE vehicle_id = ?", [vehicleId]);
    for (const row of linked) recalcVehicleItemSchedule(vehicleId, row.item_id);
    return getVehicleDetail(vehicleId);
  });
}

function copyVehicle(sourceVehicleId, payload) {
  return tx(() => {
    const source = getVehicleById(sourceVehicleId);
    if (!source) throw new Error("源车辆不存在");

    const now = nowIso();
    run(
      `INSERT INTO vehicles(vehicle_no, plate_no, vehicle_model, owner_name, owner_phone, purchase_date, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.vehicle_no,
        payload.plate_no,
        payload.vehicle_model || source.vehicle_model,
        payload.owner_name || source.owner_name,
        payload.owner_phone || source.owner_phone || "",
        payload.purchase_date || source.purchase_date || null,
        payload.note || source.note || "",
        now,
        now
      ]
    );
    const newVehicleId = lastInsertId();
    const sourceItems = all("SELECT item_id FROM vehicle_items WHERE vehicle_id = ?", [sourceVehicleId]);
    for (const row of sourceItems) {
      run(
        `INSERT OR IGNORE INTO vehicle_items(vehicle_id, item_id, last_check_date, next_due_date, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, ?, ?)`,
        [newVehicleId, row.item_id, now, now]
      );
      recalcVehicleItemSchedule(newVehicleId, row.item_id);
    }
    return getVehicleDetail(newVehicleId);
  });
}

function deleteVehicle(vehicleId) {
  write("DELETE FROM vehicles WHERE id = ?", [vehicleId]);
  return true;
}

function listItems() {
  return all("SELECT * FROM inspection_items ORDER BY enabled DESC, name");
}

function createItem(payload) {
  return tx(() => {
    const now = nowIso();
    run(
      `INSERT INTO inspection_items(name, cycle_value, cycle_unit, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [payload.name, Number(payload.cycle_value), payload.cycle_unit, payload.enabled ? 1 : 0, now, now]
    );
    const itemId = lastInsertId();
    if (payload.enabled) {
      const vehicles = all("SELECT id, purchase_date FROM vehicles");
      for (const vehicle of vehicles) {
        const nextDue = vehicle.purchase_date
          ? addCycle(vehicle.purchase_date, Number(payload.cycle_value), payload.cycle_unit)
          : null;
        run(
          `INSERT OR IGNORE INTO vehicle_items(vehicle_id, item_id, last_check_date, next_due_date, created_at, updated_at)
           VALUES (?, ?, NULL, ?, ?, ?)`,
          [vehicle.id, itemId, nextDue, now, now]
        );
      }
    }
    return getItemById(itemId);
  });
}

function updateItem(itemId, payload) {
  return tx(() => {
    const now = nowIso();
    const before = getItemById(itemId);
    run(
      `UPDATE inspection_items
       SET name = ?, cycle_value = ?, cycle_unit = ?, enabled = ?, updated_at = ?
       WHERE id = ?`,
      [payload.name, Number(payload.cycle_value), payload.cycle_unit, payload.enabled ? 1 : 0, now, itemId]
    );

    if (payload.enabled && before && Number(before.enabled) === 0) {
      const vehicles = all("SELECT id, purchase_date FROM vehicles");
      for (const vehicle of vehicles) {
        const nextDue = vehicle.purchase_date
          ? addCycle(vehicle.purchase_date, Number(payload.cycle_value), payload.cycle_unit)
          : null;
        run(
          `INSERT OR IGNORE INTO vehicle_items(vehicle_id, item_id, last_check_date, next_due_date, created_at, updated_at)
           VALUES (?, ?, NULL, ?, ?, ?)`,
          [vehicle.id, itemId, nextDue, now, now]
        );
      }
    }

    const vehicleRows = all("SELECT vehicle_id FROM vehicle_items WHERE item_id = ?", [itemId]);
    for (const row of vehicleRows) recalcVehicleItemSchedule(row.vehicle_id, itemId);
    return getItemById(itemId);
  });
}

function deleteItem(itemId) {
  write("DELETE FROM inspection_items WHERE id = ?", [itemId]);
  return true;
}

function removeVehicleItem(vehicleId, itemId) {
  return tx(() => {
    run("DELETE FROM inspection_records WHERE vehicle_id = ? AND item_id = ?", [vehicleId, itemId]);
    run("DELETE FROM reminder_logs WHERE vehicle_id = ? AND item_id = ?", [vehicleId, itemId]);
    run("DELETE FROM vehicle_items WHERE vehicle_id = ? AND item_id = ?", [vehicleId, itemId]);
    return true;
  });
}

function addVehicleItem(vehicleId, itemId) {
  return tx(() => {
    const vehicle = getVehicleById(vehicleId);
    if (!vehicle) throw new Error("车辆不存在");
    const item = getItemById(itemId);
    if (!item) throw new Error("检查项目不存在");
    const existed = one("SELECT id FROM vehicle_items WHERE vehicle_id = ? AND item_id = ?", [vehicleId, itemId]);
    if (existed) throw new Error("该车辆已关联该项目");

    const now = nowIso();
    const nextDue = vehicle.purchase_date ? addCycle(vehicle.purchase_date, Number(item.cycle_value), item.cycle_unit) : null;
    run(
      `INSERT INTO vehicle_items(vehicle_id, item_id, last_check_date, next_due_date, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?)`,
      [vehicleId, itemId, nextDue, now, now]
    );
    return getVehicleDetail(vehicleId);
  });
}

function ensureVehicleItemLink(vehicleId, itemId) {
  const existed = one("SELECT id FROM vehicle_items WHERE vehicle_id = ? AND item_id = ?", [vehicleId, itemId]);
  if (existed) return;
  const now = nowIso();
  run(
    `INSERT INTO vehicle_items(vehicle_id, item_id, last_check_date, next_due_date, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, ?, ?)`,
    [vehicleId, itemId, now, now]
  );
  recalcVehicleItemSchedule(vehicleId, itemId);
}

function createRecord(payload) {
  return tx(() => {
    if (payload && payload.link_only) {
      ensureVehicleItemLink(payload.vehicle_id, payload.item_id);
      return { linked: true, vehicle_id: payload.vehicle_id, item_id: payload.item_id };
    }
    const now = nowIso();
    ensureVehicleItemLink(payload.vehicle_id, payload.item_id);
    run(
      `INSERT INTO inspection_records(vehicle_id, item_id, check_date, result, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.vehicle_id,
        payload.item_id,
        payload.check_date,
        payload.result || "pass",
        payload.note || "",
        now,
        now
      ]
    );
    const recordId = lastInsertId();
    recalcVehicleItemSchedule(payload.vehicle_id, payload.item_id);
    return one("SELECT * FROM inspection_records WHERE id = ?", [recordId]);
  });
}

function updateRecord(recordId, payload) {
  return tx(() => {
    const before = one("SELECT * FROM inspection_records WHERE id = ?", [recordId]);
    if (!before) throw new Error("检查记录不存在");
    const now = nowIso();
    run(
      `UPDATE inspection_records
       SET vehicle_id = ?, item_id = ?, check_date = ?, result = ?, note = ?, updated_at = ?
       WHERE id = ?`,
      [
        payload.vehicle_id,
        payload.item_id,
        payload.check_date,
        payload.result || "pass",
        payload.note || "",
        now,
        recordId
      ]
    );
    recalcVehicleItemSchedule(payload.vehicle_id, payload.item_id);
    if (before.vehicle_id !== payload.vehicle_id || before.item_id !== payload.item_id) {
      recalcVehicleItemSchedule(before.vehicle_id, before.item_id);
    }
    return one("SELECT * FROM inspection_records WHERE id = ?", [recordId]);
  });
}

function deleteRecord(recordId) {
  return tx(() => {
    const before = one("SELECT * FROM inspection_records WHERE id = ?", [recordId]);
    if (!before) return true;
    run("DELETE FROM inspection_records WHERE id = ?", [recordId]);
    recalcVehicleItemSchedule(before.vehicle_id, before.item_id);
    return true;
  });
}

function listRecords(filters = {}) {
  const clauses = ["1 = 1"];
  const params = [];
  if (filters.vehicle_id) {
    clauses.push("r.vehicle_id = ?");
    params.push(filters.vehicle_id);
  }
  if (filters.item_id) {
    clauses.push("r.item_id = ?");
    params.push(filters.item_id);
  }
  if (filters.date_from) {
    clauses.push("r.check_date >= ?");
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    clauses.push("r.check_date <= ?");
    params.push(filters.date_to);
  }
  if (filters.result) {
    clauses.push("r.result = ?");
    params.push(filters.result);
  }
  return all(
    `SELECT
      r.*,
      v.vehicle_no,
      v.plate_no,
      ii.name AS item_name,
      vi.next_due_date
     FROM inspection_records r
     JOIN vehicles v ON v.id = r.vehicle_id
     JOIN inspection_items ii ON ii.id = r.item_id
     LEFT JOIN vehicle_items vi ON vi.vehicle_id = r.vehicle_id AND vi.item_id = r.item_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY r.check_date DESC, r.id DESC`,
    params
  );
}

function listDueEntries(filters = {}) {
  const today = todayStr();
  const in7 = addDays(today, 7);
  const monthStart = `${today.slice(0, 8)}01`;
  const monthEnd = formatDate(new Date(parseDate(monthStart).getFullYear(), parseDate(monthStart).getMonth() + 1, 0));
  const clauses = ["ii.enabled = 1", "vi.next_due_date IS NOT NULL"];
  const params = [];
  if (filters.vehicle_id) {
    clauses.push("vi.vehicle_id = ?");
    params.push(filters.vehicle_id);
  }
  if (filters.item_id) {
    clauses.push("vi.item_id = ?");
    params.push(filters.item_id);
  }
  if (filters.status === "upcoming") {
    clauses.push("vi.next_due_date BETWEEN ? AND ?");
    params.push(today, in7);
  } else if (filters.status === "overdue") {
    clauses.push("vi.next_due_date < ?");
    params.push(today);
  } else if (filters.status === "month") {
    clauses.push("vi.next_due_date BETWEEN ? AND ?");
    params.push(monthStart, monthEnd);
  }

  const rows = all(
    `SELECT
      vi.vehicle_id,
      vi.item_id,
      v.vehicle_no,
      v.plate_no,
      ii.name AS item_name,
      vi.last_check_date,
      vi.next_due_date
     FROM vehicle_items vi
     JOIN vehicles v ON v.id = vi.vehicle_id
     JOIN inspection_items ii ON ii.id = vi.item_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY vi.next_due_date ASC`,
    params
  );

  return rows.map((row) => {
    const diff = daysBetween(row.next_due_date, today);
    let status = "normal";
    if (diff !== null) {
      if (diff < 0) status = "overdue";
      else if (diff <= 7) status = "upcoming";
    }
    return { ...row, days_left: diff, status };
  });
}

function getDashboardData() {
  const today = todayStr();
  const monthStart = `${today.slice(0, 8)}01`;
  const monthEnd = formatDate(new Date(parseDate(monthStart).getFullYear(), parseDate(monthStart).getMonth() + 1, 0));
  const dueRows = listDueEntries();
  const upcoming = dueRows.filter((row) => row.status === "upcoming");
  const overdue = dueRows.filter((row) => row.status === "overdue");

  const checkedThisMonth = one(
    `SELECT COUNT(*) AS c FROM inspection_records
     WHERE check_date BETWEEN ? AND ?`,
    [monthStart, monthEnd]
  );
  const dueThisMonth = one(
    `SELECT COUNT(*) AS c FROM vehicle_items vi
     JOIN inspection_items ii ON ii.id = vi.item_id
     WHERE ii.enabled = 1 AND vi.next_due_date BETWEEN ? AND ?`,
    [monthStart, monthEnd]
  );
  const vehicleCount = one("SELECT COUNT(*) AS c FROM vehicles");

  return {
    today,
    upcoming,
    overdue,
    stats: {
      vehicle_count: Number(vehicleCount.c),
      check_count_month: Number(checkedThisMonth.c),
      due_count_month: Number(dueThisMonth.c),
      overdue_count: overdue.length
    }
  };
}

function consumeDueReminders() {
  return tx(() => {
    const today = todayStr();
    const dueRows = listDueEntries().filter((row) => row.status === "upcoming" || row.status === "overdue");
    const reminders = [];
    const now = nowIso();
    for (const row of dueRows) {
      const exists = one(
        `SELECT id FROM reminder_logs
         WHERE vehicle_id = ? AND item_id = ? AND reminder_date = ?`,
        [row.vehicle_id, row.item_id, today]
      );
      if (!exists) {
        run(
          `INSERT INTO reminder_logs(vehicle_id, item_id, reminder_date, status, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [row.vehicle_id, row.item_id, today, row.status, now]
        );
        reminders.push(row);
      }
    }
    return reminders;
  });
}

function getExportRows(filters = {}) {
  if (filters.export_type === "due") {
    return listDueEntries({
      status: filters.status || "",
      vehicle_id: filters.vehicle_id || null,
      item_id: filters.item_id || null
    }).map((row) => ({
      车辆编号: row.vehicle_no,
      车牌号: row.plate_no,
      检查项目: row.item_name,
      最近检查: row.last_check_date || "",
      下次到期: row.next_due_date || "",
      状态: row.status === "overdue" ? "已逾期" : row.status === "upcoming" ? "7天内到期" : "正常",
      剩余天数: row.days_left
    }));
  }
  const records = listRecords(filters);
  return records.map((row) => ({
    车辆编号: row.vehicle_no,
    车牌号: row.plate_no,
    检查项目: row.item_name,
    检查日期: row.check_date,
    检查结果: row.result === "pass" ? "合格" : "不合格",
    备注: row.note || "",
    下次到期: row.next_due_date || ""
  }));
}

module.exports = {
  initDatabase,
  listVehicles,
  getVehicleDetail,
  createVehicle,
  updateVehicle,
  copyVehicle,
  deleteVehicle,
  listItems,
  createItem,
  updateItem,
  deleteItem,
  addVehicleItem,
  removeVehicleItem,
  bulkImportVehicles,
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  listDueEntries,
  getDashboardData,
  consumeDueReminders,
  getExportRows
};
