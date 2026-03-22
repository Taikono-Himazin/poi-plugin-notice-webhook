'use strict'

const { isJwtExpired, extractRegion } = require('../lib/jwt')
const { buildGenericPayload, buildDiscordPayload, buildSlackPayload } = require('../lib/payloads')
const { extractTimersFromBody } = require('../lib/timers')

// =============================================
// extractRegion
// =============================================

describe('extractRegion', () => {
  test('API Gateway URL からリージョンを抽出する', () => {
    expect(extractRegion('https://abc123.execute-api.ap-northeast-1.amazonaws.com/v1'))
      .toBe('ap-northeast-1')
  })

  test('us-east-1 リージョン', () => {
    expect(extractRegion('https://xyz.execute-api.us-east-1.amazonaws.com/prod'))
      .toBe('us-east-1')
  })

  test('マッチしない URL はデフォルト ap-northeast-1', () => {
    expect(extractRegion('https://example.com/api')).toBe('ap-northeast-1')
  })

  test('空文字はデフォルト ap-northeast-1', () => {
    expect(extractRegion('')).toBe('ap-northeast-1')
  })

  test('null はデフォルト ap-northeast-1', () => {
    expect(extractRegion(null)).toBe('ap-northeast-1')
  })
})

// =============================================
// isJwtExpired
// =============================================

describe('isJwtExpired', () => {
  function makeJwt(exp) {
    const header = btoa(JSON.stringify({ alg: 'RS256' }))
    const payload = btoa(JSON.stringify({ sub: 'user', exp }))
    return `${header}.${payload}.signature`
  }

  test('未来の exp なら false (有効)', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    expect(isJwtExpired(makeJwt(exp))).toBe(false)
  })

  test('過去の exp なら true (期限切れ)', () => {
    const exp = Math.floor(Date.now() / 1000) - 60
    expect(isJwtExpired(makeJwt(exp))).toBe(true)
  })

  test('不正なトークンは true', () => {
    expect(isJwtExpired('invalid-token')).toBe(true)
  })

  test('空文字は true', () => {
    expect(isJwtExpired('')).toBe(true)
  })
})

// =============================================
// buildGenericPayload
// =============================================

describe('buildGenericPayload', () => {
  test('メッセージとタイプを含む', () => {
    const p = buildGenericPayload('テスト', { type: 'expedition', title: '遠征' })
    expect(p.message).toBe('テスト')
    expect(p.type).toBe('expedition')
    expect(p.title).toBe('遠征')
    expect(p.timestamp).toBeDefined()
  })

  test('type 未指定なら default', () => {
    const p = buildGenericPayload('msg', {})
    expect(p.type).toBe('default')
  })

  test('title が文字列以外なら空文字', () => {
    const p = buildGenericPayload('msg', { type: 'repair', title: 123 })
    expect(p.title).toBe('')
  })
})

// =============================================
// buildDiscordPayload
// =============================================

describe('buildDiscordPayload', () => {
  test('Discord Embed 構造を生成する', () => {
    const p = buildDiscordPayload('遠征完了', { type: 'expedition', title: '遠征完了通知' })
    expect(p.username).toBe('poi 通知')
    expect(p.embeds).toHaveLength(1)
    expect(p.embeds[0].description).toBe('遠征完了')
    expect(p.embeds[0].title).toBe('遠征完了通知')
    expect(p.embeds[0].color).toBe(0x5865f2)
    expect(p.embeds[0].footer.text).toBe('poi · expedition')
  })

  test('title が空ならデフォルト "poi 通知"', () => {
    const p = buildDiscordPayload('msg', { type: 'repair' })
    expect(p.embeds[0].title).toBe('poi 通知')
  })

  test('各タイプのカラーコード', () => {
    expect(buildDiscordPayload('', { type: 'expedition' }).embeds[0].color).toBe(0x5865f2)
    expect(buildDiscordPayload('', { type: 'repair' }).embeds[0].color).toBe(0x57f287)
    expect(buildDiscordPayload('', { type: 'construction' }).embeds[0].color).toBe(0xfee75c)
    expect(buildDiscordPayload('', { type: 'unknown' }).embeds[0].color).toBe(0xaaaaaa)
  })
})

// =============================================
// buildSlackPayload
// =============================================

describe('buildSlackPayload', () => {
  test('Slack Attachment 構造を生成する', () => {
    const p = buildSlackPayload('入渠完了', { type: 'repair', title: '入渠通知' })
    expect(p.attachments).toHaveLength(1)
    expect(p.attachments[0].text).toBe('入渠完了')
    expect(p.attachments[0].title).toBe('入渠通知')
    expect(p.attachments[0].color).toBe('#57f287')
    expect(p.attachments[0].footer).toBe('poi · repair')
    expect(p.attachments[0].ts).toBeGreaterThan(0)
  })

  test('title が空ならデフォルト "poi 通知"', () => {
    const p = buildSlackPayload('msg', { type: 'expedition' })
    expect(p.attachments[0].title).toBe('poi 通知')
  })
})

// =============================================
// extractTimersFromBody
// =============================================

describe('extractTimersFromBody', () => {
  const future = Date.now() + 3600_000
  const past = Date.now() - 1000

  describe('遠征 (expedition)', () => {
    test('port API から遠征タイマーを抽出する', () => {
      const body = {
        api_deck_port: [
          { api_id: 1, api_mission: [1, 5, future, 0] }, // 第1艦隊: スキップ
          { api_id: 2, api_mission: [1, 5, future, 0] }, // 第2艦隊: 有効
          { api_id: 3, api_mission: [0, 0, 0, 0] },       // 未出撃: スキップ
          { api_id: 4, api_mission: [1, 10, future, 0] }, // 第4艦隊: 有効
        ],
      }
      const timers = extractTimersFromBody('/kcsapi/api_port/port', body)
      expect(timers).toHaveLength(2)
      expect(timers[0].type).toBe('expedition')
      expect(timers[0].slot).toBe(2)
      expect(timers[1].slot).toBe(4)
    })

    test('期限切れの遠征はスキップする', () => {
      const body = {
        api_deck_port: [
          { api_id: 2, api_mission: [1, 5, past, 0] },
        ],
      }
      const timers = extractTimersFromBody('/kcsapi/api_port/port', body)
      expect(timers).toHaveLength(0)
    })

    test('getStoreFn で遠征名を取得する', () => {
      const getStore = (key) => {
        if (key === 'const.$missions') return { 5: { api_name: '海上護衛任務' } }
        return null
      }
      const body = {
        api_deck_port: [
          { api_id: 2, api_mission: [1, 5, future, 0] },
        ],
      }
      const timers = extractTimersFromBody('/kcsapi/api_port/port', body, getStore)
      expect(timers[0].message).toContain('海上護衛任務')
    })
  })

  describe('入渠 (repair)', () => {
    test('port API から入渠タイマーを抽出する', () => {
      const body = {
        api_ndock: [
          { api_id: 1, api_ship_id: 100, api_complete_time: future },
          { api_id: 2, api_ship_id: 0, api_complete_time: 0 }, // 空ドック
        ],
      }
      const timers = extractTimersFromBody('/kcsapi/api_port/port', body)
      expect(timers).toHaveLength(1)
      expect(timers[0].type).toBe('repair')
      expect(timers[0].slot).toBe(1)
      expect(timers[0].message).toContain('ドック1')
    })

    test('ndock API から直接抽出する', () => {
      const body = [
        { api_id: 1, api_ship_id: 50, api_complete_time: future },
      ]
      const timers = extractTimersFromBody('/kcsapi/api_get_member/ndock', body)
      expect(timers).toHaveLength(1)
      expect(timers[0].type).toBe('repair')
    })

    test('getStoreFn で艦名を取得する', () => {
      const getStore = (key) => {
        if (key === 'info.ships') return { 100: { api_ship_id: 200 } }
        if (key === 'const.$ships') return { 200: { api_name: '島風' } }
        return null
      }
      const body = {
        api_ndock: [
          { api_id: 1, api_ship_id: 100, api_complete_time: future },
        ],
      }
      const timers = extractTimersFromBody('/kcsapi/api_port/port', body, getStore)
      expect(timers[0].message).toContain('島風')
    })
  })

  describe('建造 (construction)', () => {
    test('port API から建造タイマーを抽出する', () => {
      const body = {
        api_kdock: [
          { api_id: 1, api_ship_id: 200, api_complete_time: future },
          { api_id: 2, api_ship_id: -1, api_complete_time: 0 },   // 未使用
          { api_id: 3, api_ship_id: 0, api_complete_time: 0 },    // 空
        ],
      }
      const timers = extractTimersFromBody('/kcsapi/api_port/port', body)
      expect(timers).toHaveLength(1)
      expect(timers[0].type).toBe('construction')
      expect(timers[0].slot).toBe(1)
    })

    test('kdock API から直接抽出する', () => {
      const body = [
        { api_id: 1, api_ship_id: 300, api_complete_time: future },
      ]
      const timers = extractTimersFromBody('/kcsapi/api_get_member/kdock', body)
      expect(timers).toHaveLength(1)
    })

    test('getStoreFn で建造艦名を取得する', () => {
      const getStore = (key) => {
        if (key === 'const.$ships') return { 300: { api_name: '大和' } }
        return null
      }
      const body = {
        api_kdock: [
          { api_id: 1, api_ship_id: 300, api_complete_time: future },
        ],
      }
      const timers = extractTimersFromBody('/kcsapi/api_port/port', body, getStore)
      expect(timers[0].message).toContain('大和')
    })
  })

  describe('複合ケース', () => {
    test('遠征・入渠・建造を同時に抽出する', () => {
      const body = {
        api_deck_port: [
          { api_id: 2, api_mission: [1, 5, future, 0] },
        ],
        api_ndock: [
          { api_id: 1, api_ship_id: 100, api_complete_time: future },
        ],
        api_kdock: [
          { api_id: 1, api_ship_id: 200, api_complete_time: future },
        ],
      }
      const timers = extractTimersFromBody('/kcsapi/api_port/port', body)
      expect(timers).toHaveLength(3)
      expect(timers.map(t => t.type)).toEqual(['expedition', 'repair', 'construction'])
    })

    test('空の body なら空配列', () => {
      const timers = extractTimersFromBody('/kcsapi/api_port/port', {})
      expect(timers).toEqual([])
    })

    test('関係ない path なら空配列', () => {
      const timers = extractTimersFromBody('/kcsapi/api_req_sortie/battleresult', {})
      expect(timers).toEqual([])
    })
  })
})
