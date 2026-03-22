const isJwtExpired = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 < Date.now()
  } catch (_) {
    return true
  }
}

const extractRegion = (apiUrl) => {
  const m = (apiUrl || '').match(/execute-api\.([^.]+)\.amazonaws\.com/)
  return m ? m[1] : 'ap-northeast-1'
}

module.exports = { isJwtExpired, extractRegion }
