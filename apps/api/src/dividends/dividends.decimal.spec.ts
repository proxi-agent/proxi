import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyPercent, formatDecimal, multiplyToCents, parseDecimal, roundedDivide } from './dividends.decimal.js'

describe('dividends decimal helpers', () => {
  it('parses positive and negative decimals at 1e-8 precision', () => {
    assert.equal(parseDecimal('0').toString(), '0')
    assert.equal(parseDecimal('1').toString(), '100000000')
    assert.equal(parseDecimal('1.25').toString(), '125000000')
    assert.equal(parseDecimal('-0.00000001').toString(), '-1')
    assert.equal(parseDecimal('12345.67891234').toString(), '1234567891234')
  })

  it('rejects malformed decimal strings', () => {
    assert.throws(() => parseDecimal('abc'))
    assert.throws(() => parseDecimal(''))
    assert.throws(() => parseDecimal('1.2.3'))
  })

  it('round-trips through formatDecimal', () => {
    assert.equal(formatDecimal(parseDecimal('1.25')), '1.25')
    assert.equal(formatDecimal(parseDecimal('-7.5')), '-7.5')
    assert.equal(formatDecimal(parseDecimal('1000000.00000001')), '1000000.00000001')
  })

  it('multiplyToCents avoids floating-point drift on tricky inputs', () => {
    assert.equal(multiplyToCents('100.5', '0.25'), 2513) // 100.5 × 0.25 = 25.125 → 2513¢ (round half-up)
    assert.equal(multiplyToCents('1234567.89', '0.01'), 1_234_568) // ¢123,4568 → $12,345.68
    assert.equal(multiplyToCents('0.1', '0.1'), 1) // 0.01 → 1¢
  })

  it('applyPercent computes withholding cents with banker-safe rounding', () => {
    assert.equal(applyPercent(10_000, '24'), 2_400)
    assert.equal(applyPercent(10_000, '24.5'), 2_450)
    assert.equal(applyPercent(123, '15'), 18) // 18.45 → round to 18 (half-away-from-zero on .45 is .45 < .5)
    assert.equal(applyPercent(0, '24'), 0)
  })

  it('roundedDivide handles negative quotients and ties', () => {
    assert.equal(roundedDivide(7n, 2n).toString(), '4') // 3.5 → 4
    assert.equal(roundedDivide(-7n, 2n).toString(), '-4')
    assert.equal(roundedDivide(5n, 3n).toString(), '2') // 1.67 → 2
    assert.throws(() => roundedDivide(1n, 0n))
  })
})
