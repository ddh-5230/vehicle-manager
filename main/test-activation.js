#!/usr/bin/env node

// 简单的激活系统测试脚本

const { generateFingerprint } = require("./fingerprint");
const { generateActivationCode, verifyActivationCode } = require("./activation");

console.log("🧪 激活系统功能测试\n");

// 测试 1: 生成指纹
console.log("测试 1: 生成机器指纹");
try {
  const fingerprint = generateFingerprint();
  console.log(`✓ 指纹生成成功: ${fingerprint}`);
  console.log(`  长度: ${fingerprint.length} 字符\n`);

  // 测试 2: 生成激活码
  console.log("测试 2: 生成激活码");
  const activationCode = generateActivationCode(fingerprint);
  console.log(`✓ 激活码生成成功: ${activationCode}\n`);

  // 测试 3: 验证激活码
  console.log("测试 3: 验证激活码");
  const isValid = verifyActivationCode(fingerprint, activationCode);
  console.log(`✓ 激活码验证结果: ${isValid ? "有效" : "无效"}\n`);

  // 测试 4: 验证错误的激活码
  console.log("测试 4: 验证错误的激活码（应该失败）");
  const wrongFingerprint = "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
  const isInvalid = verifyActivationCode(wrongFingerprint, activationCode);
  console.log(`✓ 错误指纹验证结果: ${isInvalid ? "有效" : "无效"} (应该是无效)\n`);

  // 测试 5: 验证格式错误的激活码
  console.log("测试 5: 验证格式错误的激活码（应该失败）");
  const malformedCode = "INVALID-CODE-123";
  const isMalformed = verifyActivationCode(fingerprint, malformedCode);
  console.log(`✓ 格式错误激活码验证结果: ${isMalformed ? "有效" : "无效"} (应该是无效)\n`);

  console.log("✅ 所有测试通过！");
} catch (error) {
  console.error("❌ 测试失败:", error.message);
  process.exit(1);
}
