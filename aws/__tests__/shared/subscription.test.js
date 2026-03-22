'use strict'

const { isPaidActive } = require('../../src/shared/subscription')

describe('isPaidActive', () => {
  test('null アカウントは false', () => {
    expect(isPaidActive(null)).toBe(false)
  })

  test('plan が free なら false', () => {
    expect(isPaidActive({ plan: 'free', subscriptionStatus: 'active' })).toBe(false)
  })

  test('plan が paid で subscriptionStatus が active なら true', () => {
    expect(isPaidActive({
      plan: 'paid',
      subscriptionStatus: 'active',
    })).toBe(true)
  })

  test('subscriptionStatus が active 以外なら false', () => {
    expect(isPaidActive({
      plan: 'paid',
      subscriptionStatus: 'canceled',
    })).toBe(false)
  })

  test('paidUntil が未来なら true', () => {
    expect(isPaidActive({
      plan: 'paid',
      subscriptionStatus: 'active',
      paidUntil: Date.now() + 86400_000,
    })).toBe(true)
  })

  test('paidUntil が過去なら false', () => {
    expect(isPaidActive({
      plan: 'paid',
      subscriptionStatus: 'active',
      paidUntil: Date.now() - 1000,
    })).toBe(false)
  })

  test('paidUntil が null なら期限チェックをスキップして true', () => {
    expect(isPaidActive({
      plan: 'paid',
      subscriptionStatus: 'active',
      paidUntil: null,
    })).toBe(true)
  })
})
