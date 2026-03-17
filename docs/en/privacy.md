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

### Information NOT Collected

- Game play data or save data
- Location or device information

---

## Third-Party Services

### Amazon Web Services (AWS)

AWS is used for account authentication (Amazon Cognito), data storage (DynamoDB), and API hosting (API Gateway / Lambda).

[AWS Privacy Policy](https://aws.amazon.com/privacy/)

---

## Data Retention

- Account information and settings: Retained until account deletion

---

## Logout Behavior

When you log out, all cloud-scheduled notifications are cancelled.

---

## Contact

For questions, please open an issue on [GitHub Issues](https://github.com/Taikono-Himazin/poi-plugin-notice-webhook/issues).

---

*Last updated: March 2026*
