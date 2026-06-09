#!/usr/bin/env node

const { generateActivationCode } = require("./activation");

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
激活码生成工具

使用方法:
  node main/generate-activation.js <fingerprint>

示例:
  node main/generate-activation.js 1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P

输出:
  激活码将打印到控制台，请复制给用户使用
    `);
    process.exit(0);
  }

  const fingerprint = args[0].toUpperCase();

  // 验证指纹格式（32 个十六进制字符）
  if (!/^[A-F0-9]{32}$/.test(fingerprint)) {
    console.error("❌ 错误：指纹格式不正确（应为 32 个十六进制字符）");
    process.exit(1);
  }

  const activationCode = generateActivationCode(fingerprint);

  console.log("\n✅ 激活码生成成功！");
  console.log(`\n指纹: ${fingerprint}`);
  console.log(`激活码: ${activationCode}`);
  console.log("\n请复制激活码发送给用户\n");
}

main();
