const path = require("path");
const fs = require("fs");
const { generateFingerprint } = require("./fingerprint");
const { verifyActivationCode } = require("./activation");

const ACTIVATION_FILE = "activation.json";

class ActivationManager {
  constructor(userDataPath) {
    this.activationFilePath = path.join(userDataPath, ACTIVATION_FILE);
  }

  getActivationData() {
    try {
      console.log("[激活系统] 读取激活文件:", this.activationFilePath);
      if (fs.existsSync(this.activationFilePath)) {
        const content = fs.readFileSync(this.activationFilePath, "utf8");
        const data = JSON.parse(content);
        console.log("[激活系统] 激活数据已读取");
        return data;
      } else {
        console.log("[激活系统] 激活文件不存在");
      }
    } catch (error) {
      console.error("[激活系统] 读取激活文件失败:", error.message);
    }
    return null;
  }

  saveActivationData(data) {
    try {
      console.log("[激活系统] 保存激活数据到:", this.activationFilePath);
      fs.mkdirSync(path.dirname(this.activationFilePath), { recursive: true });
      fs.writeFileSync(this.activationFilePath, JSON.stringify(data, null, 2), "utf8");
      console.log("[激活系统] 激活数据保存成功");
      return true;
    } catch (error) {
      console.error("[激活系统] 保存激活文件失败:", error.message);
      return false;
    }
  }

  generateFingerprint() {
    return generateFingerprint();
  }

  isActivated() {
    const data = this.getActivationData();
    if (!data || !data.fingerprint || !data.activationCode) {
      console.log("[激活系统] 激活数据不完整或不存在");
      return false;
    }

    const currentFingerprint = this.generateFingerprint();
    console.log("[激活系统] 当前指纹:", currentFingerprint);
    console.log("[激活系统] 保存的指纹:", data.fingerprint);
    
    if (currentFingerprint !== data.fingerprint) {
      console.log("[激活系统] ❌ 指纹不匹配");
      return false;
    }

    console.log("[激活系统] ✓ 指纹匹配");
    const isValid = verifyActivationCode(data.fingerprint, data.activationCode);
    console.log("[激活系统] 激活码验证结果:", isValid ? "✓ 有效" : "❌ 无效或已过期");
    return isValid;
  }

  activate(activationCode) {
    const currentFingerprint = this.generateFingerprint();
    console.log("[激活系统] 开始激活...");
    console.log("[激活系统] 当前指纹:", currentFingerprint);
    console.log("[激活系统] 输入激活码:", activationCode);
    
    if (!verifyActivationCode(currentFingerprint, activationCode)) {
      console.log("[激活系统] ❌ 激活码验证失败");
      return { success: false, error: "无效的激活码或激活码已过期" };
    }

    console.log("[激活系统] ✓ 激活码验证成功");
    const data = {
      fingerprint: currentFingerprint,
      activationCode: activationCode,
      activatedAt: new Date().toISOString()
    };

    if (this.saveActivationData(data)) {
      console.log("[激活系统] ✓ 激活成功！");
      return { success: true, message: "激活成功！" };
    } else {
      console.log("[激活系统] ❌ 激活数据保存失败");
      return { success: false, error: "激活失败，请重试" };
    }
  }

  reset() {
    try {
      if (fs.existsSync(this.activationFilePath)) {
        fs.unlinkSync(this.activationFilePath);
      }
      return true;
    } catch (error) {
      console.error("Failed to reset activation:", error);
      return false;
    }
  }
}

module.exports = ActivationManager;
