# 激活码系统集成说明

## 实现概述

该项目已成功集成了基于机器指纹的激活码系统。系统通过以下模块组成：

### 核心模块

#### 1. `main/fingerprint.js` - 指纹生成模块
- **功能**：生成唯一的机器指纹
- **原理**：基于 MAC 地址 + 硬盘序列号生成 SHA256 哈希，取前 32 个字符
- **跨平台支持**：Windows (wmic)、macOS (diskutil)、Linux (lsblk)
- **导出函数**：
  - `generateFingerprint()`：生成本机指纹
  - `getMacAddress()`：获取 MAC 地址
  - `getDiskSerial()`：获取硬盘序列号

#### 2. `main/activation.js` - 激活码生成与验证模块
- **功能**：生成和验证激活码
- **安全性**：使用 HMAC-SHA256 签名
- **有效期**：30 天
- **导出函数**：
  - `generateActivationCode(fingerprint)`：生成激活码
  - `verifyActivationCode(fingerprint, code)`：验证激活码

#### 3. `main/activation-manager.js` - 激活状态管理
- **功能**：管理应用的激活状态
- **存储**：激活数据保存在 `userData/activation.json`
- **导出方法**：
  - `generateFingerprint()`：获取当前指纹
  - `isActivated()`：检查是否已激活
  - `activate(code)`：激活应用
  - `reset()`：重置激活状态

#### 4. `main/generate-activation.js` - 开发者工具
- **功能**：CLI 工具，用于生成激活码
- **用法**：`node main/generate-activation.js <指纹>`

### UI 集成

#### 1. `renderer/index.html` - 激活对话框
- 显示本机指纹
- 提供复制指纹按钮
- 输入激活码的表单
- 对话框 ID：`activationDialog`

#### 2. `renderer/app.js` - 激活逻辑
- `showActivationDialog()`：显示激活对话框
- `bindActivationEvents()`：绑定激活表单事件
- 检查启动时的激活状态
- 监听来自主进程的激活对话框事件

#### 3. `styles/app.css` - 激活界面样式
- `.activation-hint`：提示文本
- `.activation-step`：步骤卡片
- `.fingerprint-display`：指纹显示区域

### 主进程集成

#### 1. `main/index.js` - 主进程修改
- 导入 `ActivationManager`
- 初始化激活管理器
- 检查激活状态
- 注册 IPC 处理程序：
  - `activation:get-fingerprint`
  - `activation:is-activated`
  - `activation:activate`
- 向渲染进程发送 `show-activation-dialog` 信号

#### 2. `main/preload.js` - 预加载脚本修改
- 暴露激活相关 API：
  - `getFingerprint()`
  - `isActivated()`
  - `activate(code)`
  - `onShowActivationDialog(callback)`

## 工作流程

### 首次启动

```
用户启动应用
    ↓
主进程初始化（initDatabase + 创建激活管理器）
    ↓
检查是否已激活
    ├─ 如果已激活 → 正常加载应用
    └─ 如果未激活 → 创建窗口 → 发送激活信号
    ↓
渲染进程接收信号 → 显示激活对话框
    ↓
用户复制指纹 → 发送给开发者
    ↓
开发者运行生成工具 → 生成激活码 → 发送给用户
    ↓
用户输入激活码 → 点击"激活"按钮
    ↓
IPC 调用 activation:activate → 验证激活码
    ├─ 验证成功 → 保存激活数据 → 重新加载应用
    └─ 验证失败 → 显示错误信息
```

## 激活码安全性

### 签名验证
- 使用 HMAC-SHA256 进行签名
- 激活密钥存储在 `main/activation.js`
- 生产环境可通过 `ACTIVATION_SECRET` 环境变量配置

### 有效期控制
- 激活码有效期：30 天
- 包含时间戳用于验证
- 超期激活码需要重新生成

### 指纹验证
- 检查指纹前 8 位
- 每次启动时重新验证指纹
- 指纹改变会导致激活失效

## 使用方式

### 为用户生成激活码

```bash
# 1. 用户启动应用，获取指纹（例如：ABC123...）
# 2. 用户发送指纹给开发者
# 3. 开发者运行生成工具
node main/generate-activation.js ABC123...XYZ

# 4. 输出激活码
# 5. 发送激活码给用户
```

### 测试激活系统

```bash
# 运行测试脚本
node main/test-activation.js
```

## 文件列表

```
新增文件：
├── main/
│   ├── fingerprint.js              # 指纹生成模块
│   ├── activation.js               # 激活码生成与验证
│   ├── activation-manager.js       # 激活状态管理
│   ├── generate-activation.js      # CLI 工具
│   └── test-activation.js          # 测试脚本
├── ACTIVATION_GUIDE.md             # 用户和开发者指南
├── ACTIVATION_INTEGRATION.md       # 本文件

修改文件：
├── main/
│   ├── index.js                    # 添加激活检查逻辑
│   └── preload.js                  # 暴露激活 API
├── renderer/
│   ├── index.html                  # 添加激活对话框
│   └── app.js                      # 添加激活 UI 逻辑
└── styles/
    └── app.css                     # 添加激活样式
```

## 环境变量

```bash
# 生产环境配置自定义的激活密钥
export ACTIVATION_SECRET="your-production-secret"
npm start
```

## 后续维护

### 定期检查
- 监控激活码生成日志
- 记录用户激活失败情况
- 定期更新激活密钥

### 扩展功能
- 可添加激活码有效期设置
- 可添加许可证管理系统
- 可集成云端激活验证

## 常见问题排查

### 指纹无法生成
- 检查系统权限
- 确认网卡和硬盘信息可访问
- 查看 console 中的错误日志

### 激活码验证失败
- 确认指纹和激活码匹配
- 检查激活码格式是否正确
- 验证激活码是否过期

### 激活状态丢失
- 检查 `userData/activation.json` 文件
- 验证文件系统权限
- 检查指纹是否改变

## 许可证

MIT License
