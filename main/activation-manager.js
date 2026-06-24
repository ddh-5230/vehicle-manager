const path = require("path");
const fs = require("fs");
const { generateFingerprint } = require("./fingerprint");
const { verifyActivationCode } = require("./activation");

const ACTIVATION_FILE = "activation.json";
const TRIAL_FILE = "trial.json";
const TRIAL_LABEL = "3天";
const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

class ActivationManager {
  constructor(userDataPath) {
    this.activationFilePath = path.join(userDataPath, ACTIVATION_FILE);
    this.trialFilePath = path.join(userDataPath, TRIAL_FILE);
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

  getTrialData() {
    try {
      console.log("[试用系统] 读取试用文件:", this.trialFilePath);
      if (fs.existsSync(this.trialFilePath)) {
        const content = fs.readFileSync(this.trialFilePath, "utf8");
        const data = JSON.parse(content);
        console.log("[试用系统] 试用数据已读取");
        return data;
      }
      console.log("[试用系统] 试用文件不存在");
    } catch (error) {
      console.error("[试用系统] 读取试用文件失败:", error.message);
    }
    return null;
  }

  saveTrialData(data) {
    try {
      console.log("[试用系统] 保存试用数据到:", this.trialFilePath);
      fs.mkdirSync(path.dirname(this.trialFilePath), { recursive: true });
      fs.writeFileSync(this.trialFilePath, JSON.stringify(data, null, 2), "utf8");
      console.log("[试用系统] 试用数据保存成功");
      return true;
    } catch (error) {
      console.error("[试用系统] 保存试用文件失败:", error.message);
      return false;
    }
  }

  ensureTrialData() {
    const existing = this.getTrialData();
    if (existing && existing.trialStartedAt) {
      return existing;
    }

    const created = {
      trialStartedAt: new Date().toISOString()
    };
    this.saveTrialData(created);
    return created;
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

  getAccessStatus() {
    if (this.isActivated()) {
      return {
        activated: true,
        trialExpired: false,
        trialLabel: TRIAL_LABEL
      };
    }

    const trialData = this.ensureTrialData();
    const startedAt = new Date(trialData.trialStartedAt);
    const startedTime = startedAt.getTime();

    if (Number.isNaN(startedTime)) {
      const resetData = { trialStartedAt: new Date().toISOString() };
      this.saveTrialData(resetData);
      return this.getAccessStatus();
    }

    const expiresAt = new Date(startedTime + TRIAL_DURATION_MS);
    const now = Date.now();
    const remainingMs = Math.max(0, expiresAt.getTime() - now);

    return {
      activated: false,
      trialExpired: remainingMs <= 0,
      trialLabel: TRIAL_LABEL,
      trialStartedAt: startedAt.toISOString(),
      trialExpiresAt: expiresAt.toISOString(),
      remainingMs
    };
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
      if (fs.existsSync(this.trialFilePath)) {
        fs.unlinkSync(this.trialFilePath);
      }
      return true;
    } catch (error) {
      console.error("Failed to reset activation:", error);
      return false;
    }
  }
}

module.exports = ActivationManager;
