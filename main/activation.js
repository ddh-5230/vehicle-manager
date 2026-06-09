const crypto = require("crypto");

// 激活密钥 - 生产环境应该妥善保管这个密钥
const ACTIVATION_SECRET = process.env.ACTIVATION_SECRET || "vehicle-manager-secret-key-2024";

function generateActivationCode(fingerprint) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const data = `${fingerprint}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", ACTIVATION_SECRET).update(data).digest("hex");
  const code = `${fingerprint.substring(0, 8)}-${hmac.substring(0, 16).toUpperCase()}-${timestamp}`;
  return code;
}

function verifyActivationCode(fingerprint, code) {
  try {
    const parts = code.split("-");
    if (parts.length !== 3) {
      console.log("[激活验证] 激活码格式错误：应该包含 3 部分");
      return false;
    }

    const [fp, hmac, timestamp] = parts;
    const expectedHmac = crypto.createHmac("sha256", ACTIVATION_SECRET)
      .update(`${fingerprint}:${timestamp}`)
      .digest("hex");

    // 验证指纹前缀
    if (fp !== fingerprint.substring(0, 8)) {
      console.log("[激活验证] 指纹前缀不匹配");
      console.log(`  期望: ${fingerprint.substring(0, 8)}`);
      console.log(`  收到: ${fp}`);
      return false;
    }

    // 验证 HMAC
    if (hmac !== expectedHmac.substring(0, 16).toUpperCase()) {
      console.log("[激活验证] HMAC 签名验证失败");
      return false;
    }

    // 验证时间戳（激活码有效期 90 天，足以覆盖大多数场景）
    const activatedTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    const expiry = 90 * 24 * 60 * 60; // 90 days

    if (now - activatedTime > expiry) {
      console.log("[激活验证] 激活码已过期");
      console.log(`  生成时间: ${new Date(activatedTime * 1000).toISOString()}`);
      console.log(`  当前时间: ${new Date(now * 1000).toISOString()}`);
      console.log(`  有效期: ${expiry / (24 * 60 * 60)} 天`);
      return false;
    }

    console.log("[激活验证] ✓ 激活码验证成功");
    return true;
  } catch (error) {
    console.error("[激活验证] 异常:", error.message);
    return false;
  }
}

module.exports = {
  generateActivationCode,
  verifyActivationCode
};
