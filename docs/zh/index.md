---
layout: page
title: 首页
nav_order: 1
---

[日本語](../) \| [English](../en/)

# 通知转发（poi 插件）

适用于 [poi](https://github.com/poooi/poi) 的 Webhook 通知插件。将远征完成、入渠完成、建造完成等游戏事件通知到 Discord / Slack。

## 特点

- **直接配送模式** — 从运行 poi 的机器直接发送 Webhook（无需设置）
- **云端配送模式** — 通过云端发送通知。即使关闭 poi 也能收到通知
- 支持 Discord 和 Slack

## 快速开始

### 直接配送模式（无需设置）

1. 在 poi 中安装插件
2. 在设置画面选择「直接配送」
3. 输入 Webhook URL 并保存

**获取 Webhook URL 的方法**

- **Discord** — 频道设置 → 集成 → Webhooks → 新建 Webhook（[官方帮助](https://support.discord.com/hc/articles/228383668)）
- **Slack** — 创建 [Slack App](https://api.slack.com/apps) 并启用 Incoming Webhooks（[官方帮助](https://api.slack.com/messaging/webhooks)）

### 云端配送模式

1. 在 poi 中安装插件
2. 在设置画面选择「经由云端」
3. 点击「登录」按钮创建账户并登录
4. 输入 Webhook URL 并保存

## 通知内容

| 事件 | 时机 |
|---|---|
| 远征完成 | 完成时（或之前） |
| 入渠完成 | 完成时（或之前） |
| 建造完成 | 完成时（或之前） |

## 源代码

[GitHub 仓库](https://github.com/Taikono-Himazin/poi-plugin-notice-webhook) — MIT License
