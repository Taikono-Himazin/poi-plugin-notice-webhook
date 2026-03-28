---
layout: page
title: 使用方法
nav_order: 2
---

[日本語](../usage) \| [English](../en/usage)

# 使用方法

---

## 直接配送模式

从运行 poi 的机器直接发送 Webhook。无需额外设置。

### 设置步骤

1. 在 poi 设置画面打开插件
2. 在**配送方式**中选择「直接配送」
3. 选择 Webhook 类型（Discord / Slack）
4. 输入 **Webhook URL**
5. 点击「发送测试」验证连接
6. 点击「保存」

### 获取 Webhook URL 的方法

**Discord**

1. 打开要通知的频道设置
2. 集成 → Webhooks → 新建 Webhook
3. 复制 Webhook URL（格式：`https://discord.com/api/webhooks/...`）

[官方帮助](https://support.discord.com/hc/articles/228383668)

**Slack**

1. [创建 Slack App](https://api.slack.com/apps) 并启用 Incoming Webhooks
2. 选择频道并获取 Webhook URL（格式：`https://hooks.slack.com/services/...`）

[官方帮助](https://api.slack.com/messaging/webhooks)

---

## 云端配送模式

通过云端发送通知。即使关闭 poi 也能收到通知。

### 登录

1. 在**配送方式**中选择「云端配送」
2. 点击「登录」按钮
3. 使用邮箱地址创建账户或登录（也支持 Google 登录）

### Webhook 设置

登录后设置 Webhook 类型和 URL 并保存。设置保存在云端。

### 登出

点击「登出」按钮退出账户。登出时服务器端已计划的通知将被取消。

---

## 通知颜色

| 类型 | 事件 | Discord | Slack |
|---|---|---|---|
| `expedition` | 远征完成 | 紫蓝 `#5865F2` | 紫蓝 `#5865F2` |
| `repair` | 入渠完成 | 绿色 `#57F287` | 绿色 `#57F287` |
| `construction` | 建造完成 | 黄色 `#FEE75C` | 黄色 `#FEE75C` |
| `default` | 其他 | 灰色 `#AAAAAA` | 灰色 `#AAAAAA` |

---

## 测试通知

使用设置画面的「发送测试」按钮可以验证 Webhook 连接，无需等待实际游戏事件。
