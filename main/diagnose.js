#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const os = require("os");

// 模拟获取 userData 路径（与 Electron 相同）
function getUserDataPath() {
  // macOS
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "VehicleManager");
  }
  // Windows
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "VehicleManager");
  }
  // Linux
  return path.join(os.homedir(), ".config", "VehicleManager");
}

console.log("🔍 激活系统诊断工具\n");

const userDataPath = getUserDataPath();
const activationFile = path.join(userDataPath, "activation.json");

console.log("1️⃣ 用户数据路径:", userDataPath);
console.log("2️⃣ 激活文件路径:", activationFile);
console.log("");

// 检查激活文件是否存在
if (fs.existsSync(activationFile)) {
  console.log("✓ 激活文件存在");
  try {
    const data = JSON.parse(fs.readFileSync(activationFile, "utf8"));
    console.log("\n📄 激活文件内容:");
    console.log("  指纹:", data.fingerprint);
    console.log("  激活码:", data.activationCode);
    console.log("  激活时间:", data.activatedAt);
  } catch (error) {
    console.log("❌ 激活文件损坏:", error.message);
  }
} else {
  console.log("❌ 激活文件不存在");
}

console.log("\n3️⃣ 用户数据目录内容:");
if (fs.existsSync(userDataPath)) {
  const files = fs.readdirSync(userDataPath);
  if (files.length === 0) {
    console.log("  (空目录)");
  } else {
    files.forEach(file => {
      const fullPath = path.join(userDataPath, file);
      const stat = fs.statSync(fullPath);
      console.log(`  ${file} (${stat.isDirectory() ? "目录" : "文件"})`);
    });
  }
} else {
  console.log("  (目录不存在)");
}

console.log("\n💡 诊断建议:");
console.log("- 如果激活文件不存在，说明激活状态没有被保存");
console.log("- 如果激活文件存在但仍然要求激活，说明验证逻辑可能有问题");
console.log("- 检查指纹和激活码是否在激活文件中正确保存");
