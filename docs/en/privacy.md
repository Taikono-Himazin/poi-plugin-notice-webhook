---
layout: page
title: Privacy Policy
nav_order: 5
---

[日本語](../privacy) \| [中文](../zh/privacy)

# Privacy Policy

This Privacy Policy describes how poi-plugin-notice-webhook (the "Plugin") collects and uses information.

---

## Direct Mode

In Direct mode, game event notifications are sent directly from your machine to your Webhook URL. The Plugin does not transmit or store your data on any external server.

---

## Cloud Mode

When using Cloud mode, the following information is collected and processed.

### Information Collected

| Information | Purpose |
|---|---|
| Email address | Account authentication (Amazon Cognito) |
| Webhook URL | Stored as notification delivery destination |
| Notification tokens | Used to authenticate notification requests |
| Notification content (title, message, type) | Forwarded to your Webhook |
| Billing information (plan, expiry) | Paid plan management |

### Information NOT Collected

- Game play data or save data
- Credit card numbers (processed directly by PAY.JP)
- Location or device information

---

## Third-Party Services

### Amazon Web Services (AWS)

AWS is used for account authentication (Amazon Cognito), data storage (DynamoDB), and API hosting (API Gateway / Lambda).

[AWS Privacy Policy](https://aws.amazon.com/privacy/)

### PAY.JP

PAY.JP is used for paid plan payment processing. Credit card information is processed directly by PAY.JP and is never stored on our servers.

[PAY.JP Privacy Policy](https://pay.jp/privacy)

---

## Data Retention

- Account information and settings: Retained until account deletion
- Billing records: Retained after plan expiry for record-keeping

---

## Logout Behavior

When you log out, all cloud-scheduled notifications are cancelled.

---

## Contact

For questions, please open an issue on [GitHub Issues](https://github.com/Taikono-Himazin/poi-plugin-notice-webhook/issues).

---

*Last updated: 2026*
