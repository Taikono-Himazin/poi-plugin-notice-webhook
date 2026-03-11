'use strict'

const { getAccount, isPaidActive, FREE_MONTHLY_LIMIT } = require('../shared/subscription')

const ok  = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) })
const err = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) })
const cors = () => ({ 'Access-Control-Allow-Origin': '*' })

exports.handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub
  if (!userId) return err(401, 'Unauthorized')

  const account = await getAccount(userId)
  if (!account) {
    return ok({
      plan:               'free',
      subscriptionStatus: 'inactive',
      notificationCount:  0,
      monthlyLimit:       FREE_MONTHLY_LIMIT,
    })
  }

  const paid = isPaidActive(account)
  return ok({
    plan:               account.plan ?? 'free',
    subscriptionStatus: account.subscriptionStatus ?? 'inactive',
    notificationCount:  account.notificationCount ?? 0,
    monthlyLimit:       paid ? null : FREE_MONTHLY_LIMIT, // null = unlimited
    paidUntil:          account.paidUntil ?? null,        // ms タイムスタンプ (v2 一回払い)
    hasSubscription:    !!account.payjpSubscriptionId,    // v1 サブスク有無
  })
}
