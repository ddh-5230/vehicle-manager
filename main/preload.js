const { contextBridge, ipcRenderer } = require("electron");

async function invokeVehicleItemAdd(vehicleId, itemId) {
  try {
    return await ipcRenderer.invoke("vehicle-items:add", vehicleId, itemId);
  } catch (error1) {
    try {
      return await ipcRenderer.invoke("vehicle-item:add", vehicleId, itemId);
    } catch (error2) {
      return ipcRenderer.invoke("records:create", {
        vehicle_id: vehicleId,
        item_id: itemId,
        link_only: true
      });
    }
  }
}

contextBridge.exposeInMainWorld("api", {
  dashboardGet: () => ipcRenderer.invoke("dashboard:get"),
  consumeReminders: () => ipcRenderer.invoke("reminders:consume"),

  listVehicles: () => ipcRenderer.invoke("vehicles:list"),
  getVehicleDetail: (vehicleId) => ipcRenderer.invoke("vehicles:detail", vehicleId),
  createVehicle: (payload) => ipcRenderer.invoke("vehicles:create", payload),
  updateVehicle: (vehicleId, payload) => ipcRenderer.invoke("vehicles:update", vehicleId, payload),
  copyVehicle: (sourceVehicleId, payload) => ipcRenderer.invoke("vehicles:copy", sourceVehicleId, payload),
  deleteVehicle: (vehicleId) => ipcRenderer.invoke("vehicles:delete", vehicleId),

  listItems: () => ipcRenderer.invoke("items:list"),
  createItem: (payload) => ipcRenderer.invoke("items:create", payload),
  updateItem: (itemId, payload) => ipcRenderer.invoke("items:update", itemId, payload),
  deleteItem: (itemId) => ipcRenderer.invoke("items:delete", itemId),
  addVehicleItemLegacy: (vehicleId, itemId) => invokeVehicleItemAdd(vehicleId, itemId),
  addVehicleItem: (vehicleId, itemId) => invokeVehicleItemAdd(vehicleId, itemId),
  removeVehicleItemLegacy: (vehicleId, itemId) => ipcRenderer.invoke("vehicle-item:delete", vehicleId, itemId),
  removeVehicleItem: (vehicleId, itemId) => ipcRenderer.invoke("vehicle-items:delete", vehicleId, itemId),

  listRecords: (filters) => ipcRenderer.invoke("records:list", filters),
  createRecord: (payload) => ipcRenderer.invoke("records:create", payload),
  updateRecord: (recordId, payload) => ipcRenderer.invoke("records:update", recordId, payload),
  deleteRecord: (recordId) => ipcRenderer.invoke("records:delete", recordId),

  listDueEntries: (filters) => ipcRenderer.invoke("queries:due", filters),
  exportData: (filters) => ipcRenderer.invoke("export:data", filters)
});
