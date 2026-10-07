// Currencies a rate card can be billed in. Zoho Books bills each customer in one currency (set on the customer in
// Zoho), so a rate card's currency must match the Zoho customer it is invoiced to.
export const CURRENCIES = [
  ['INR', 'Indian rupee'], ['USD', 'US dollar'], ['AED', 'UAE dirham'], ['EUR', 'Euro'], ['GBP', 'British pound'],
  ['SAR', 'Saudi riyal'], ['QAR', 'Qatari riyal'], ['OMR', 'Omani rial'], ['KWD', 'Kuwaiti dinar'], ['BHD', 'Bahraini dinar'],
  ['SGD', 'Singapore dollar'], ['AUD', 'Australian dollar'], ['CAD', 'Canadian dollar'], ['CHF', 'Swiss franc'], ['JPY', 'Japanese yen'],
] as const

export const CURRENCY_CODES: readonly string[] = CURRENCIES.map(([c]) => c)

/** Why a statement in `cardCurrency` can't be invoiced to a Zoho customer billed in `zohoCurrency` (null when it can). */
export function currencyProblem(customer: string, zohoCurrency: string | undefined, cardCurrency: string | undefined): string | null {
  if (!zohoCurrency || !cardCurrency || zohoCurrency === cardCurrency) return null
  return `Zoho bills ${customer} in ${zohoCurrency}, but this rate card is in ${cardCurrency}. ` +
    `Revise the rate card to ${zohoCurrency}, or link the customer to a Zoho customer set up in ${cardCurrency}, then press Retry.`
}
