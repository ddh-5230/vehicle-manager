const state = {
  vehicles: [],
  items: [],
  records: [],
  selectedVehicleId: null,
  currentVehicleDetail: null,
  lastQueryFilters: {}
};

const $ = (id) => document.getElementById(id);

function unitLabel(unit) {
  if (unit === "day") return "天";
  if (unit === "month") return "月";
  if (unit === "year") return "年";
  return unit;
}

function statusLabel(status) {
  if (status === "overdue") return "已逾期";
  if (status === "upcoming") return "7天内到期";
  return "正常";
}

function calcDueStatus(nextDueDate) {
  if (!nextDueDate) return "normal";
  const now = new Date();
  const target = new Date(`${nextDueDate}T00:00:00`);
  const diff = Math.floor((target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  if (diff < 0) return "overdue";
  if (diff <= 7) return "upcoming";
  return "normal";
}

function toast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.style.background = isError ? "#8d312a" : "#1f5f50";
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2200);
}

async function safeCall(fn, successMessage) {
  try {
    const result = await fn();
    if (successMessage) toast(successMessage);
    return result;
  } catch (error) {
    toast(error?.message || String(error), true);
    throw error;
  }
}

function switchView(viewName) {
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === viewName));
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  $(`view-${viewName}`).classList.add("active");
  const titleMap = {
    dashboard: "首页总览",
    vehicles: "车辆管理",
    items: "检查项目",
    records: "检查记录",
    query: "查询导出"
  };
  $("viewTitle").textContent = titleMap[viewName] || "车辆检查管理";
}

function fillVehicleAndItemSelects() {
  const vehicleOpts = state.vehicles
    .map((v) => `<option value="${v.id}">${v.vehicle_no} | ${v.plate_no}</option>`)
    .join("");
  const itemOpts = state.items.map((i) => `<option value="${i.id}">${i.name}</option>`).join("");

  $("recordVehicle").innerHTML = vehicleOpts;
  $("recordItem").innerHTML = itemOpts;
  $("queryVehicle").innerHTML = `<option value="">全部</option>${vehicleOpts}`;
  $("queryItem").innerHTML = `<option value="">全部</option>${itemOpts}`;
}

function renderDashboard(dashboard) {
  $("todayLabel").textContent = `日期：${dashboard.today}`;
  $("dashboardCards").innerHTML = [
    { label: "车辆总数", value: dashboard.stats.vehicle_count },
    { label: "本月检查记录", value: dashboard.stats.check_count_month },
    { label: "本月需检查项目", value: dashboard.stats.due_count_month },
    { label: "当前逾期项目", value: dashboard.stats.overdue_count }
  ]
    .map((c) => `<article class="card"><h4>${c.label}</h4><strong>${c.value}</strong></article>`)
    .join("");

  $("overdueBody").innerHTML =
    dashboard.overdue
      .map(
        (row) => `
      <tr class="overdue-row">
        <td>${row.vehicle_no}</td>
        <td>${row.plate_no}</td>
        <td>${row.item_name}</td>
        <td>${row.next_due_date || "-"}</td>
        <td>${Math.abs(Number(row.days_left || 0))}</td>
      </tr>`
      )
      .join("") || `<tr><td colspan="5">暂无逾期项目</td></tr>`;

  $("upcomingBody").innerHTML =
    dashboard.upcoming
      .map(
        (row) => `
      <tr class="upcoming-row">
        <td>${row.vehicle_no}</td>
        <td>${row.plate_no}</td>
        <td>${row.item_name}</td>
        <td>${row.next_due_date || "-"}</td>
        <td>${Number(row.days_left || 0)}</td>
      </tr>`
      )
      .join("") || `<tr><td colspan="5">暂无7天内到期项目</td></tr>`;
}

function renderVehicles() {
  $("vehicleBody").innerHTML =
    state.vehicles
      .map(
        (v) => `
      <tr>
        <td>${v.vehicle_no}</td>
        <td>${v.plate_no}</td>
        <td>${v.vehicle_model}</td>
        <td>${v.owner_name}</td>
        <td>${v.owner_phone || "-"}</td>
        <td>${v.purchase_date || "-"}</td>
        <td>${v.item_count}</td>
        <td>${v.upcoming_count}</td>
        <td>${v.overdue_count}</td>
        <td>
          <button class="btn secondary small-btn" data-action="vehicle-items" data-id="${v.id}">查看项目</button>
          <button class="btn secondary small-btn" data-action="vehicle-edit" data-id="${v.id}">编辑</button>
          <button class="btn secondary small-btn" data-action="vehicle-copy" data-id="${v.id}">复制</button>
          <button class="btn danger small-btn" data-action="vehicle-delete" data-id="${v.id}">删除</button>
        </td>
      </tr>`
      )
      .join("") || `<tr><td colspan="10">暂无车辆，请先新增。</td></tr>`;
}

function renderItems() {
  $("itemBody").innerHTML =
    state.items
      .map(
        (item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.cycle_value}</td>
        <td>${unitLabel(item.cycle_unit)}</td>
        <td>${Number(item.enabled) ? "启用" : "停用"}</td>
        <td>
          <button class="btn secondary small-btn" data-action="item-edit" data-id="${item.id}">编辑</button>
          <button class="btn danger small-btn" data-action="item-delete" data-id="${item.id}">删除</button>
        </td>
      </tr>`
      )
      .join("") || `<tr><td colspan="5">暂无项目。</td></tr>`;
}

function renderRecords() {
  $("recordBody").innerHTML =
    state.records
      .map(
        (record) => `
      <tr>
        <td>${record.check_date}</td>
        <td>${record.vehicle_no} | ${record.plate_no}</td>
        <td>${record.item_name}</td>
        <td>${record.result === "pass" ? "合格" : "不合格"}</td>
        <td>${record.note || "-"}</td>
        <td>${record.next_due_date || "-"}</td>
        <td>
          <button class="btn secondary small-btn" data-action="record-edit" data-id="${record.id}">编辑</button>
          <button class="btn danger small-btn" data-action="record-delete" data-id="${record.id}">删除</button>
        </td>
      </tr>`
      )
      .join("") || `<tr><td colspan="7">暂无检查记录。</td></tr>`;
}

function renderVehicleItems(detail) {
  state.currentVehicleDetail = detail;
  state.selectedVehicleId = detail.vehicle.id;
  $("addVehicleItemBtn").disabled = false;
  $("vehicleDetailHint").textContent = `车辆 ${detail.vehicle.vehicle_no} | ${detail.vehicle.plate_no} 的项目配置`;
  $("vehicleItemsWrap").classList.remove("hidden");
  $("vehicleItemsBody").innerHTML =
    detail.items
      .map((row) => {
        const status = row.due_status === "overdue" ? "overdue" : row.due_status === "upcoming" ? "upcoming" : "normal";
        return `
        <tr>
          <td>${row.item_name}</td>
          <td>${row.cycle_value}${unitLabel(row.cycle_unit)}</td>
          <td>${row.last_check_date || "-"}</td>
          <td>${row.next_due_date || "-"}</td>
          <td><span class="status ${status}">${statusLabel(status)}</span></td>
          <td>
            <button class="btn primary small-btn" data-action="vehicle-item-check" data-vehicle-id="${detail.vehicle.id}" data-item-id="${row.item_id}">登记检查</button>
            <button class="btn danger small-btn" data-action="vehicle-item-delete" data-vehicle-id="${detail.vehicle.id}" data-item-id="${row.item_id}">删除项目</button>
          </td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="6">暂无绑定项目。</td></tr>`;
}

function openVehicleItemDialog() {
  if (!state.currentVehicleDetail) {
    toast("请先点击某辆车的查看项目", true);
    return;
  }
  const linkedIds = new Set(state.currentVehicleDetail.items.map((row) => Number(row.item_id)));
  const availableItems = state.items.filter((item) => !linkedIds.has(Number(item.id)));
  if (availableItems.length === 0) {
    toast("该车辆已关联全部项目");
    return;
  }
  $("vehicleItemVehicleId").value = String(state.currentVehicleDetail.vehicle.id);
  $("vehicleItemSelect").innerHTML = availableItems
    .map((item) => `<option value="${item.id}">${item.name}（${item.cycle_value}${unitLabel(item.cycle_unit)}）</option>`)
    .join("");
  $("vehicleItemDialog").showModal();
}

function renderQueryResult(rows) {
  $("queryDueBody").innerHTML =
    rows
      .map((row) => {
        const status = row.status || calcDueStatus(row.next_due_date);
        const textStatus = statusLabel(status);
        return `
        <tr class="${status === "overdue" ? "overdue-row" : status === "upcoming" ? "upcoming-row" : ""}">
          <td>${row.vehicle_no}</td>
          <td>${row.plate_no}</td>
          <td>${row.item_name}</td>
          <td>${row.last_check_date || row.check_date || "-"}</td>
          <td>${row.next_due_date || "-"}</td>
          <td><span class="status ${status}">${textStatus}</span></td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="6">没有符合条件的数据</td></tr>`;
}

async function refreshAll() {
  const [vehicles, items, records, dashboard] = await Promise.all([
    window.api.listVehicles(),
    window.api.listItems(),
    window.api.listRecords({}),
    window.api.dashboardGet()
  ]);
  state.vehicles = vehicles;
  state.items = items;
  state.records = records;

  fillVehicleAndItemSelects();
  renderDashboard(dashboard);
  renderVehicles();
  renderItems();
  renderRecords();
}

function openVehicleDialog(mode, row) {
  $("vehicleForm").reset();
  $("vehicleId").value = "";
  $("vehicleCopySourceId").value = "";
  if (mode === "create") {
    $("vehicleDialogTitle").textContent = "新增车辆";
  }
  if (mode === "edit" && row) {
    $("vehicleDialogTitle").textContent = "编辑车辆";
    $("vehicleId").value = row.id;
    $("vehicleNo").value = row.vehicle_no || "";
    $("plateNo").value = row.plate_no || "";
    $("vehicleModel").value = row.vehicle_model || "";
    $("ownerName").value = row.owner_name || "";
    $("ownerPhone").value = row.owner_phone || "";
    $("purchaseDate").value = row.purchase_date || "";
    $("vehicleNote").value = row.note || "";
  }
  if (mode === "copy" && row) {
    $("vehicleDialogTitle").textContent = "复制车辆";
    $("vehicleCopySourceId").value = row.id;
    $("vehicleNo").value = `${row.vehicle_no}-COPY`;
    $("plateNo").value = "";
    $("vehicleModel").value = row.vehicle_model || "";
    $("ownerName").value = row.owner_name || "";
    $("ownerPhone").value = row.owner_phone || "";
    $("purchaseDate").value = row.purchase_date || "";
    $("vehicleNote").value = row.note || "";
  }
  $("vehicleDialog").showModal();
}

function openItemDialog(mode, row) {
  $("itemForm").reset();
  $("itemId").value = "";
  if (mode === "create") {
    $("itemDialogTitle").textContent = "新增项目";
  }
  if (mode === "edit" && row) {
    $("itemDialogTitle").textContent = "编辑项目";
    $("itemId").value = row.id;
    $("itemName").value = row.name;
    $("itemCycleValue").value = row.cycle_value;
    $("itemCycleUnit").value = row.cycle_unit;
    $("itemEnabled").checked = Number(row.enabled) === 1;
  }
  $("itemDialog").showModal();
}

function openCheckDialog(vehicleId, itemId, itemName) {
  $("checkForm").reset();
  $("checkVehicleId").value = String(vehicleId);
  $("checkItemId").value = String(itemId);
  $("checkDate").value = new Date().toISOString().slice(0, 10);
  $("checkResult").value = "pass";
  $("checkNote").value = "";
  $("checkDialogTitle").textContent = `登记检查 - ${itemName}`;
  $("checkDialog").showModal();
}

function resetRecordForm() {
  $("recordId").value = "";
  $("recordDate").value = new Date().toISOString().slice(0, 10);
  $("recordNote").value = "";
  $("recordResult").value = "pass";
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  $("refreshAllBtn").addEventListener("click", async () => {
    await safeCall(refreshAll, "数据已刷新");
  });

  $("createVehicleBtn").addEventListener("click", () => openVehicleDialog("create"));
  $("closeVehicleDialog").addEventListener("click", () => $("vehicleDialog").close());
  $("createItemBtn").addEventListener("click", () => openItemDialog("create"));
  $("closeItemDialog").addEventListener("click", () => $("itemDialog").close());
  $("addVehicleItemBtn").addEventListener("click", () => openVehicleItemDialog());
  $("closeVehicleItemDialog").addEventListener("click", () => $("vehicleItemDialog").close());
  $("closeCheckDialog").addEventListener("click", () => $("checkDialog").close());

  $("vehicleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      vehicle_no: $("vehicleNo").value.trim(),
      plate_no: $("plateNo").value.trim(),
      vehicle_model: $("vehicleModel").value.trim(),
      owner_name: $("ownerName").value.trim(),
      owner_phone: $("ownerPhone").value.trim(),
      purchase_date: $("purchaseDate").value || null,
      note: $("vehicleNote").value.trim()
    };
    const vehicleId = $("vehicleId").value;
    const copySourceId = $("vehicleCopySourceId").value;
    if (copySourceId) {
      await safeCall(() => window.api.copyVehicle(Number(copySourceId), payload), "复制车辆成功");
    } else if (vehicleId) {
      await safeCall(() => window.api.updateVehicle(Number(vehicleId), payload), "车辆已更新");
    } else {
      await safeCall(() => window.api.createVehicle(payload), "车辆新增成功");
    }
    $("vehicleDialog").close();
    await refreshAll();
  });

  $("itemForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      name: $("itemName").value.trim(),
      cycle_value: Number($("itemCycleValue").value),
      cycle_unit: $("itemCycleUnit").value,
      enabled: $("itemEnabled").checked
    };
    const itemId = $("itemId").value;
    if (itemId) {
      await safeCall(() => window.api.updateItem(Number(itemId), payload), "项目已更新");
    } else {
      await safeCall(() => window.api.createItem(payload), "项目新增成功");
    }
    $("itemDialog").close();
    await refreshAll();
  });

  $("vehicleBody").addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const row = state.vehicles.find((v) => v.id === id);
    if (!row) return;

    if (btn.dataset.action === "vehicle-items") {
      const detail = await safeCall(() => window.api.getVehicleDetail(id));
      if (detail) renderVehicleItems(detail);
      return;
    }
    if (btn.dataset.action === "vehicle-edit") {
      openVehicleDialog("edit", row);
      return;
    }
    if (btn.dataset.action === "vehicle-copy") {
      openVehicleDialog("copy", row);
      return;
    }
    if (btn.dataset.action === "vehicle-delete") {
      if (!window.confirm(`确认删除车辆 ${row.vehicle_no}（将删除全部检查记录）？`)) return;
      await safeCall(() => window.api.deleteVehicle(id), "车辆已删除");
      await refreshAll();
    }
  });

  $("vehicleItemsBody").addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const vehicleId = Number(btn.dataset.vehicleId);
    const itemId = Number(btn.dataset.itemId);
    if (btn.dataset.action === "vehicle-item-check") {
      const itemName =
        btn.closest("tr")?.querySelector("td")?.textContent?.trim() ||
        state.items.find((item) => item.id === itemId)?.name ||
        "检查项目";
      openCheckDialog(vehicleId, itemId, itemName);
      return;
    }

    if (btn.dataset.action === "vehicle-item-delete") {
      if (!window.confirm("确认仅删除该车辆下的此检查项目及其记录？")) return;
      await safeCall(() => window.api.removeVehicleItem(vehicleId, itemId), "车辆项目已删除");
      const detail = await safeCall(() => window.api.getVehicleDetail(vehicleId));
      if (detail) renderVehicleItems(detail);
      await refreshAll();
    }
  });

  $("vehicleItemForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const vehicleId = Number($("vehicleItemVehicleId").value);
    const itemId = Number($("vehicleItemSelect").value);
    await safeCall(() => window.api.addVehicleItem(vehicleId, itemId), "项目已关联到该车辆");
    $("vehicleItemDialog").close();
    const detail = await safeCall(() => window.api.getVehicleDetail(vehicleId));
    if (detail) renderVehicleItems(detail);
    await refreshAll();
  });

  $("checkForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const vehicleId = Number($("checkVehicleId").value);
    const itemId = Number($("checkItemId").value);
    const payload = {
      vehicle_id: vehicleId,
      item_id: itemId,
      check_date: $("checkDate").value,
      result: $("checkResult").value,
      note: $("checkNote").value.trim()
    };
    await safeCall(() => window.api.createRecord(payload), "检查已登记，项目时间已更新");
    $("checkDialog").close();
    const detail = await safeCall(() => window.api.getVehicleDetail(vehicleId));
    if (detail) renderVehicleItems(detail);
    await refreshAll();
  });

  $("itemBody").addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const row = state.items.find((item) => item.id === id);
    if (!row) return;

    if (btn.dataset.action === "item-edit") {
      openItemDialog("edit", row);
      return;
    }
    if (btn.dataset.action === "item-delete") {
      if (!window.confirm(`确认删除项目 ${row.name}（所有车辆对应记录也会删除）？`)) return;
      await safeCall(() => window.api.deleteItem(id), "项目已删除");
      await refreshAll();
    }
  });

  $("recordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      vehicle_id: Number($("recordVehicle").value),
      item_id: Number($("recordItem").value),
      check_date: $("recordDate").value,
      result: $("recordResult").value,
      note: $("recordNote").value.trim()
    };
    const recordId = $("recordId").value;
    if (recordId) {
      await safeCall(() => window.api.updateRecord(Number(recordId), payload), "检查记录已更新");
    } else {
      await safeCall(() => window.api.createRecord(payload), "检查记录已录入");
    }
    resetRecordForm();
    await refreshAll();
  });

  $("recordCancelEdit").addEventListener("click", () => resetRecordForm());

  $("recordBody").addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const record = state.records.find((r) => r.id === id);
    if (!record) return;
    if (btn.dataset.action === "record-edit") {
      $("recordId").value = record.id;
      $("recordVehicle").value = record.vehicle_id;
      $("recordItem").value = record.item_id;
      $("recordDate").value = record.check_date;
      $("recordResult").value = record.result;
      $("recordNote").value = record.note || "";
      switchView("records");
      return;
    }
    if (btn.dataset.action === "record-delete") {
      if (!window.confirm("确认删除该检查记录？")) return;
      await safeCall(() => window.api.deleteRecord(id), "记录已删除");
      await refreshAll();
    }
  });

  $("queryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const filters = {
      vehicle_id: $("queryVehicle").value ? Number($("queryVehicle").value) : null,
      item_id: $("queryItem").value ? Number($("queryItem").value) : null,
      date_from: $("queryStart").value || null,
      date_to: $("queryEnd").value || null,
      status: $("queryPreset").value || ""
    };
    state.lastQueryFilters = filters;

    if (filters.status) {
      const rows = await safeCall(() => window.api.listDueEntries(filters));
      renderQueryResult(rows);
    } else {
      const rows = await safeCall(() => window.api.listRecords(filters));
      renderQueryResult(
        rows.map((r) => ({
          ...r,
          status: calcDueStatus(r.next_due_date),
          last_check_date: r.check_date
        }))
      );
    }
  });

  $("exportRecordsBtn").addEventListener("click", async () => {
    const filters = {
      ...state.lastQueryFilters,
      export_type: "records"
    };
    const result = await safeCall(() => window.api.exportData(filters));
    if (result && !result.canceled) toast(`已导出 ${result.count} 条记录到 ${result.path}`);
  });

  $("exportDueBtn").addEventListener("click", async () => {
    const filters = {
      ...state.lastQueryFilters,
      export_type: "due"
    };
    const result = await safeCall(() => window.api.exportData(filters));
    if (result && !result.canceled) toast(`已导出 ${result.count} 条数据到 ${result.path}`);
  });
}

async function notifyReminders() {
  const reminders = await window.api.consumeReminders();
  if (!reminders || reminders.length === 0) return;
  const overdue = reminders.filter((r) => r.status === "overdue");
  const upcoming = reminders.filter((r) => r.status === "upcoming");
  const sorted = [...overdue, ...upcoming];

  $("reminderOverdueCount").textContent = String(overdue.length);
  $("reminderUpcomingCount").textContent = String(upcoming.length);
  $("reminderTotalCount").textContent = String(reminders.length);

  $("reminderList").innerHTML = sorted
    .map((r) => {
      const flag = r.status === "overdue" ? "已逾期" : "7天内到期";
      const daysText = r.status === "overdue" ? `逾期 ${Math.abs(Number(r.days_left || 0))} 天` : `剩余 ${Number(r.days_left || 0)} 天`;
      return `
      <li class="${r.status}">
        <strong>${flag}</strong> | ${r.vehicle_no} | ${r.plate_no} | ${r.item_name}<br />
        到期日期：${r.next_due_date || "-"}，${daysText}
      </li>`;
    })
    .join("");

  const dialog = $("reminderDialog");
  dialog.addEventListener(
    "cancel",
    (event) => {
      event.preventDefault();
    },
    { once: true }
  );
  dialog.showModal();
}

async function init() {
  bindEvents();
  resetRecordForm();
  await safeCall(refreshAll);
  await safeCall(notifyReminders);
}

window.addEventListener("DOMContentLoaded", init);
