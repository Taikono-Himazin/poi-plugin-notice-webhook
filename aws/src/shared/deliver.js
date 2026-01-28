'use strict'

const https = require('https')
const http  = require('http')
const { URLSearchParams } = require('url')

// 通知タイプ別カラー
const COLORS = {
  expedition:   { hex: '#5865f2', int: 0x5865f2 },
  repair:       { hex: '#57f287', int: 0x57f287 },
  construction: { hex: '#fee75c', int: 0xfee75c },
  default:      { hex: '#aaaaaa', int: 0xaaaaaa },
}
const getColor = (type) => COLORS[type] ?? COLORS.default

// ---- ペイロード生成 ----
const buildDiscordPayload = (msg, options) => ({
  username: 'poi 通知',
  embeds: [{
    title:       options?.title || 'poi 通知',
    description: msg,
    color:       getColor(options?.type).int,
    timestamp:   new Date().toISOString(),
    footer:      { text: `poi · ${options?.type || 'default'}` },
  }],
})

const buildSlackPayload = (msg, options) => ({
  attachments: [{
    color:  getColor(options?.type).hex,
    title:  options?.title || 'poi 通知',
    text:   msg,
    footer: `poi · ${options?.type || 'default'}`,
    ts:     Math.floor(Date.now() / 1000),
  }],
})

// ---- 軽量 HTTP POST（外部依存なし） ----
function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const isJson = typeof body === 'object'
    const data   = isJson ? JSON.stringify(body) : body.toString()
    const parsed = new URL(url)
    const lib    = parsed.protocol === 'https:' ? https : http

    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers: {
        'Content-Type':   isJson ? 'application/json' : 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    }, (res) => {
      let raw = ''
      res.on('data', (chunk) => { raw += chunk })
      res.on('end',  () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(raw)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`))
        }
      })
    })

    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// ---- 配信 ----
async function deliverNotification(user, payload) {
  const msg     = payload.message || ''
  const options = { type: payload.type, title: payload.title }

  switch (user.type) {
    case 'discord':
      await post(user.url, buildDiscordPayload(msg, options))
      break

    case 'slack':
      await post(user.url, buildSlackPayload(msg, options))
      break

    case 'line':
      await post(
        'https://notify-api.line.me/api/notify',
        new URLSearchParams({ message: msg }).toString(),
        { Authorization: `Bearer ${user.lineToken}` },
      )
      break

    default: // generic
      await post(user.url, payload)
      break
  }
}

module.exports = { deliverNotification }
