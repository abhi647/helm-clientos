/** CSAT maths in one place. CSAT % = share of answers that are 4 or 5. Scores are counted, never invented. */
export type CsatRow = { score: number | null; answered_at: string | null; sent_at: string; kind: string; customer_id: string }

export const SCORE_LABEL: Record<number, string> = { 1: 'Very dissatisfied', 2: 'Dissatisfied', 3: 'Neutral', 4: 'Satisfied', 5: 'Very satisfied' }

export function summarise(rows: CsatRow[]) {
  const answered = rows.filter((r) => r.score != null)
  const satisfied = answered.filter((r) => r.score! >= 4).length
  return {
    sent: rows.length,
    responses: answered.length,
    csat: answered.length ? Math.round((100 * satisfied) / answered.length) : null,
    average: answered.length ? answered.reduce((a, r) => a + r.score!, 0) / answered.length : null,
    responseRate: rows.length ? Math.round((100 * answered.length) / rows.length) : null,
    distribution: [5, 4, 3, 2, 1].map((s) => ({ score: s, count: answered.filter((r) => r.score === s).length })),
  }
}

/** CSAT % per calendar month (by answer date), oldest first, including empty months. */
export function byMonth(rows: CsatRow[], months: number, now: Date) {
  const out: { key: string; label: string; csat: number | null; responses: number }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = d.toISOString().slice(0, 7)
    const inMonth = rows.filter((r) => r.score != null && r.answered_at?.slice(0, 7) === key)
    const sat = inMonth.filter((r) => r.score! >= 4).length
    out.push({ key, label: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }), csat: inMonth.length ? Math.round((100 * sat) / inMonth.length) : null, responses: inMonth.length })
  }
  return out
}
