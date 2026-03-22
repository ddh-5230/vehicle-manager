# 车辆检查管理系统（Electron + SQLite）

本项目为危险品运输企业的车辆检查管理离线桌面系统。  
技术栈：`Electron` + `HTML/CSS/JavaScript` + `SQLite(sql.js)`。

## 功能覆盖

- 车辆信息管理（新增、编辑、复制、删除）
- 检查项目管理（项目名称、周期、启用状态）
- 检查记录管理（新增、编辑、删除）
- 周期计算（自动更新最近检查与下次到期）
- 到期提醒（提前 7 天 + 逾期每日提醒）
- 首页统计（即将到期、已逾期、本月统计）
- 条件查询（车辆 / 项目 / 时间 / 快捷状态）
- 数据导出（Excel：检查记录、到期列表）

## 项目结构

```text
vehicle-manager/
├─ docs/
│  └─ 数据库设计.md
├─ main/
│  ├─ db.js
│  ├─ index.js
│  └─ preload.js
├─ renderer/
│  ├─ app.js
│  └─ index.html
├─ styles/
│  └─ app.css
├─ package.json
└─ 项目介绍.md
```

## 运行方式

```bash
npm install
npm start
```

## 数据库文件

- 数据库存放路径：Electron `userData` 目录下 `vehicle_manager.db`
- 首次启动自动初始化表结构与默认检查项目

## 已实现业务规则说明

1. 新增车辆自动绑定启用项目，按购买日期计算初始到期日。
2. 复制车辆复制项目配置，不复制历史检查记录。
3. 录入或修改检查记录后，自动重算该项目下次到期时间。
4. 删除车辆级联删除车辆项目、检查记录与提醒日志。
5. 删除车辆项目仅影响该车辆下该项目数据。
6. 到期提醒：提前 7 天触发；逾期持续提醒；录入新记录后自动取消提醒。

## 验证命令

```bash
npm run check
```

## 生成安装包

```bash
# macOS 生成 dmg
npm run pack:mac

# Windows 生成 exe (NSIS 安装包)
npm run pack:win
```

产物默认输出到 `dist/` 目录。

说明：
- 在 macOS 上打 Windows `exe` 可能依赖额外环境（wine 等），若失败建议在 Windows 环境执行 `npm run pack:win`。
- 本地离线数据库在用户目录，不会打进固定数据文件，安装后每台电脑独立生成自己的数据文件。
