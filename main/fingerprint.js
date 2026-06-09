const os = require("os");
const fs = require("fs");
const { execSync } = require("child_process");
const crypto = require("crypto");

const VIRTUAL_INTERFACE_PREFIXES = [
  "lo",
  "utun",
  "awdl",
  "llw",
  "bridge",
  "docker",
  "veth",
  "vmnet"
];

function isVirtualInterface(name) {
  const lowerName = String(name || "").toLowerCase();
  return VIRTUAL_INTERFACE_PREFIXES.some((prefix) => lowerName.startsWith(prefix));
}

function getMacAddress() {
  const interfaces = os.networkInterfaces();
  const macs = [];

  for (const name of Object.keys(interfaces).sort()) {
    if (isVirtualInterface(name)) continue;

    for (const iface of interfaces[name]) {
      if (iface.internal || !iface.mac || iface.mac === "00:00:00:00:00:00") {
        continue;
      }
      macs.push(iface.mac.toUpperCase());
    }
  }

  const uniqueMacs = Array.from(new Set(macs)).sort();
  return uniqueMacs.length > 0 ? uniqueMacs.join(",") : "UNKNOWN";
}

function runCommand(command) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  }).trim();
}

function readFirstExistingFile(filePaths) {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8").trim();
        if (content) return content;
      }
    } catch (error) {
      // Ignore and continue to the next candidate.
    }
  }
  return "UNKNOWN";
}

function getDiskSerial() {
  try {
    const platform = process.platform;

    if (platform === "darwin") {
      const platformUuid = runCommand("ioreg -rd1 -c IOPlatformExpertDevice");
      const match = platformUuid.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      return match ? match[1].trim().toUpperCase() : "UNKNOWN";
    }

    if (platform === "win32") {
      const output = runCommand("wmic csproduct get UUID");
      const lines = output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && line.toUpperCase() !== "UUID");
      return lines[0] ? lines[0].toUpperCase() : "UNKNOWN";
    }

    if (platform === "linux") {
      return readFirstExistingFile(["/etc/machine-id", "/var/lib/dbus/machine-id"]).toUpperCase();
    }

    return "UNKNOWN";
  } catch (error) {
    return "UNKNOWN";
  }
}

function generateFingerprint() {
  const mac = getMacAddress();
  const disk = getDiskSerial();
  const combined = `${process.platform}:${mac}:${disk}`;
  const hash = crypto.createHash("sha256").update(combined).digest("hex");
  return hash.substring(0, 32).toUpperCase();
}

module.exports = {
  generateFingerprint,
  getMacAddress,
  getDiskSerial
};
