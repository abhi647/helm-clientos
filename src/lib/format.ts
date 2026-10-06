import type { Enums } from '@/lib/database.types'

const DAY = 86_400_000

/** "Oct 12" (or "Oct 12, 2025" outside the current year). Dates are stored as yyyy-mm-dd. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' })
}

export function daysFromToday(iso: string | null | undefined): number | null {
  if (!iso) return null
  const today = new Date()
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - t) / DAY)
}

/** ISO timestamp n days ago (server-side filters). */
export const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()

export const isOverdue = (iso: string | null | undefined) => (daysFromToday(iso) ?? 1) < 0

export function relativeTime(iso: string): string {
  const diff = (Date.now() - Date.parse(iso)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)} h ago`
  if (diff < 7 * 86_400) return `${Math.floor(diff / 86_400)} d ago`
  return shortDate(iso)
}

export function ageInDays(iso: string): string {
  return `${Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY))}d`
}

/** Formats an amount from Zoho or a typed rate. `exact` keeps the paise/cents (rates and statement lines). */
export function money(amount: number | null | undefined, currency = 'INR', { exact = false }: { exact?: boolean } = {}): string {
  if (amount == null) return '–'
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: exact ? 2 : 0 }).format(amount)
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

export const label = (s: string) => (s === 'uat' ? 'UAT' : s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()))

export const TASK_STATUS: Record<Enums<'task_status'>, string> = {
  todo: 'Not started', in_progress: 'In progress', in_review: 'In review', waiting_customer: 'With customer', blocked: 'Blocked', done: 'Done',
}
export const REQUEST_STATUS_ORDER: Enums<'request_status'>[] = ['submitted', 'under_review', 'clarification', 'estimated', 'approved', 'scheduled', 'in_development', 'uat', 'delivered']
export const HEALTH: Record<Enums<'health'>, string> = { on_track: 'On track', needs_attention: 'Needs attention', at_risk: 'At risk' }

/** True when the timestamp is in the future (server-side checks). */
export const isFuture = (iso: string | null | undefined) => !!iso && Date.parse(iso) > Date.now()
