'use strict'

/**
 * GET /billing/pay-complete
 *
 * PAY.JP v2 checkout の success_url / cancel_url として使用するページ。
 * ユーザーにウィンドウを閉じるよう促す。
 */
exports.handler = async (event) => {
  const canceled = event.queryStringParameters?.canceled === '1'

  const html = canceled ? `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>キャンセル</title>
<style>body{font-family:sans-serif;text-align:center;padding:48px;color:#555}</style>
</head><body>
<p>決済をキャンセルしました。</p>
<p>このウィンドウを閉じてください。</p>
</body></html>`
  : `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>登録完了</title>
<style>body{font-family:sans-serif;text-align:center;padding:48px;color:#555}
h2{color:#5cb85c}</style>
</head><body>
<h2>✅ 登録完了</h2>
<p>有料プランが有効になりました。</p>
<p>このウィンドウを閉じて poi プラグインに戻ってください。</p>
</body></html>`

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  }
}
