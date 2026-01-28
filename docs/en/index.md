---
layout: page
title: Home
nav_order: 1
---

[日本語](../) \| [中文](../zh/)

# Notification Forwarder (poi Plugin)

A Webhook notification plugin for [poi](https://github.com/poooi/poi). Sends Discord / Slack notifications for game events such as expedition completion, repair completion, and construction completion.

## Features

- **Direct mode** — Send Webhooks directly from the machine running poi (no setup required)
- **Cloud mode (DENTAN Plan)** — Cloud-based notifications. Delivered even when poi is closed
- Supports Discord and Slack
- Paid plan: notify N minutes before completion (delayed notifications)

## Plans

| | Free | Paid |
|---|---|---|
| Direct delivery | OK | OK |
| Cloud delivery | Up to 30/month | Unlimited |
| Delayed notifications (N min before) | — | OK |
| Price | Free | From ¥100/month |

Paid plans are one-time payments for 1 / 6 / 12 months. Purchasing while a plan is still active extends the remaining period.

## Quick Start

### Direct Mode (no setup required)

1. Install the plugin in poi
2. Select "Direct" in the settings
3. Enter your Webhook URL and save

**How to get a Webhook URL**

- **Discord** — Channel Settings → Integrations → Webhooks → New Webhook ([Official Help](https://support.discord.com/hc/articles/228383668))
- **Slack** — Create a [Slack App](https://api.slack.com/apps) and enable Incoming Webhooks ([Official Help](https://api.slack.com/messaging/webhooks))

### Cloud Mode (DENTAN Plan)

1. Install the plugin in poi
2. Select "Via Cloud" in the settings
3. Click "Login" to create an account and sign in
4. Enter your Webhook URL and save

## Notification Events

| Event | Timing |
|---|---|
| Expedition complete | At completion (or just before) |
| Repair complete | At completion (or just before) |
| Construction complete | At completion (or just before) |

## Source Code

[GitHub Repository](https://github.com/Taikono-Himazin/poi-plugin-notice-webhook) — MIT License
