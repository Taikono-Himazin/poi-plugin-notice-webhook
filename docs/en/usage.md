---
layout: page
title: Usage
nav_order: 2
---

[日本語](../usage) \| [中文](../zh/usage)

# Usage

---

## Direct Mode

Sends Webhooks directly from the machine running poi. No additional setup required.

### Setup

1. Open the plugin in poi settings
2. Select **"Direct"** under Delivery Mode
3. Choose Webhook type (Discord / Slack)
4. Enter the **Webhook URL**
5. Click "Send Test" to verify
6. Click "Save"

### How to Get a Webhook URL

**Discord**

1. Open the settings for the channel you want to notify
2. Integrations → Webhooks → New Webhook
3. Copy the Webhook URL (format: `https://discord.com/api/webhooks/...`)

[Official Help](https://support.discord.com/hc/articles/228383668)

**Slack**

1. [Create a Slack App](https://api.slack.com/apps) and enable Incoming Webhooks
2. Select a channel and copy the Webhook URL (format: `https://hooks.slack.com/services/...`)

[Official Help](https://api.slack.com/messaging/webhooks)

---

## Cloud Mode (PREMIUM)

Notifications are sent from the cloud. Delivered even when poi is closed.

### Login

1. Select **"Cloud (PREMIUM)"** under Delivery Mode
2. Click the "Login" button
3. Create an account or sign in with your email address

### Webhook Configuration

After logging in, set the Webhook type and URL and save. Settings are stored in the cloud.

### Delayed Notifications (N Minutes Before)

With a paid plan, you can receive notifications **N minutes before** completion.

Adjust with the "Notify before (min)" slider in settings. Set to 0 for immediate notification at completion.

### Upgrading to a Paid Plan

The free plan is limited to 30 notifications per month. A paid plan is required for more.

1. Open the "Payment" section in settings and select a plan (1 / 6 / 12 months)
2. Click "Purchase"
3. Enter your card details on the PAY.JP payment page
4. Activated automatically after payment

Purchasing while a plan is still active extends the remaining period.

### Logout

Click the "Logout" button to sign out. Scheduled notifications are cancelled on the server when you log out.

---

## Notification Colors

| Type | Event | Discord | Slack |
|---|---|---|---|
| `expedition` | Expedition complete | Purple `#5865F2` | Purple `#5865F2` |
| `repair` | Repair complete | Green `#57F287` | Green `#57F287` |
| `construction` | Construction complete | Yellow `#FEE75C` | Yellow `#FEE75C` |
| `default` | Other | Gray `#AAAAAA` | Gray `#AAAAAA` |

---

## Test Notification

Use the "Send Test" button in settings to verify your Webhook connection without waiting for an actual game event.
