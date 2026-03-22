// ゲームデータからタイマーリストを生成する
// getStoreFn: オプション。window.getStore の代替を注入可能にする
function extractTimersFromBody(path, body, getStoreFn) {
  const timers = []
  const now = Date.now()

  // 遠征: deck の api_mission[0]=1(出撃中), api_mission[2]=完了時刻(ms)
  const decks = (path === '/kcsapi/api_port/port')
    ? (body.api_deck_port || [])
    : (path === '/kcsapi/api_get_member/deck') ? (body || []) : []
  for (const deck of decks) {
    const fleetId = deck.api_id
    if (fleetId < 2 || fleetId > 4) continue // 第1艦隊は遠征不可
    const mission = deck.api_mission
    if (!mission || mission[0] !== 1 || !(mission[2] > 0)) continue
    const completesAt = mission[2] // Unix ms
    if (completesAt <= now) continue

    // 遠征名をマスターデータから取得 (api_mission[1] が遠征 ID)
    let missionName = ''
    try {
      const missionId = mission[1]
      const missions = getStoreFn?.('const.$missions')
      missionName = missions?.[missionId]?.api_name || ''
    } catch (_) { }

    timers.push({
      type: 'expedition',
      slot: fleetId,
      completesAt: new Date(completesAt).toISOString(),
      message: missionName
        ? `第${fleetId}艦隊の遠征が完了します（${missionName}）`
        : `第${fleetId}艦隊の遠征が完了します`,
    })
  }

  // 入渠: ndock の api_ship_id > 0, api_complete_time > 0
  const ndock = (path === '/kcsapi/api_port/port')
    ? (body.api_ndock || [])
    : (path === '/kcsapi/api_get_member/ndock') ? (body || []) : []
  for (const dock of ndock) {
    if (!(dock.api_ship_id > 0) || !(dock.api_complete_time > 0)) continue
    const completesAt = dock.api_complete_time
    if (completesAt <= now) continue

    // 艦名をストアから取得（info.ships は api_id でインデックス済み）
    let shipName = ''
    try {
      const ships = getStoreFn?.('info.ships')
      const shipInstance = ships?.[dock.api_ship_id]
      if (shipInstance) {
        const masterShips = getStoreFn?.('const.$ships')
        shipName = masterShips?.[shipInstance.api_ship_id]?.api_name || ''
      }
    } catch (_) { }

    timers.push({
      type: 'repair',
      slot: dock.api_id,
      completesAt: new Date(completesAt).toISOString(),
      message: shipName
        ? `${shipName}の入渠が完了します（ドック${dock.api_id}）`
        : `入渠が完了します（ドック${dock.api_id}）`,
    })
  }

  // 建造: kdock の api_ship_id !== 0 && !== -1, api_complete_time > 0
  const kdock = (path === '/kcsapi/api_port/port')
    ? (body.api_kdock || [])
    : (path === '/kcsapi/api_get_member/kdock') ? (body || []) : []
  for (const dock of kdock) {
    if (dock.api_ship_id === 0 || dock.api_ship_id === -1) continue
    if (!(dock.api_complete_time > 0)) continue
    const completesAt = dock.api_complete_time
    if (completesAt <= now) continue

    // 建造艦名をマスターデータから取得（kdock.api_ship_id はマスター艦種 ID）
    let shipName = ''
    try {
      const masterShips = getStoreFn?.('const.$ships')
      shipName = masterShips?.[dock.api_ship_id]?.api_name || ''
    } catch (_) { }

    timers.push({
      type: 'construction',
      slot: dock.api_id,
      completesAt: new Date(completesAt).toISOString(),
      message: shipName
        ? `${shipName}の建造が完了します（ドック${dock.api_id}）`
        : `建造が完了します（ドック${dock.api_id}）`,
    })
  }

  return timers
}

module.exports = { extractTimersFromBody }
