---
layout: page
title: 隐私政策
nav_order: 5
---

[日本語](../privacy) \| [English](../en/privacy)

# 隐私政策

本隐私政策说明 poi-plugin-notice-webhook（以下简称"本插件"）在使用过程中收集和使用的信息。

---

## 关于直接配送模式

在直接配送模式下，游戏事件通知直接从您的设备发送到 Webhook URL。本插件不会将您的数据发送或保存到任何外部服务器。

---

## 关于云端配送模式

使用云端配送模式时，将收集和处理以下信息。

### 收集的信息

| 信息                         | 用途                       |
| ---------------------------- | -------------------------- |
| 电子邮件地址                 | 账户认证（Amazon Cognito） |
| Webhook URL                  | 作为通知发送目标保存       |
| 通知令牌                     | 用于通知认证               |
| 通知内容（标题、消息、类型） | 转发至 Webhook             |

### 不收集的信息

- 游戏数据或存档数据
- 位置信息或设备信息

---

## 使用的第三方服务

### Amazon Web Services (AWS)

使用 AWS 进行账户认证（Amazon Cognito）、数据存储（DynamoDB）和 API 托管（API Gateway / Lambda）。

[AWS 隐私政策](https://aws.amazon.com/cn/privacy/)

---

## 数据保存期限

- 账户信息和设置：保存至注销（删除账户）为止

---

## 登出时的行为

登出时，云端已计划的所有通知将被取消。

---

## 联系方式

如有疑问，请通过 [GitHub Issues](https://github.com/Taikono-Himazin/poi-plugin-notice-webhook/issues) 联系。

---

_最后更新：2026年3月_
