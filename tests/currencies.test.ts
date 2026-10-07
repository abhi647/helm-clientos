import { describe, expect, it } from 'vitest'
import { CURRENCY_CODES, currencyProblem } from '@/lib/currencies'

describe('billing currencies', () => {
  it('offers the currencies we bill in', () => {
    for (const c of ['INR', 'USD', 'AED', 'EUR', 'GBP', 'SAR']) expect(CURRENCY_CODES).toContain(c)
  })
  it('a statement goes to Zoho only in the currency the Zoho customer is billed in', () => {
    expect(currencyProblem('Nesma Group', 'AED', 'AED')).toBeNull()
    expect(currencyProblem('Nesma Group', undefined, 'USD')).toBeNull()   // Zoho did not say: Zoho decides
    expect(currencyProblem('Nesma Group', 'AED', 'USD')).toMatch(/Zoho bills Nesma Group in AED, but this rate card is in USD/)
  })
})
