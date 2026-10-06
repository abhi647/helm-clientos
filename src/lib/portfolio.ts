import 'server-only'
import type { Enums } from '@/lib/database.types'
import { ageInDays, daysFromToday } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export type PortfolioRow = {
  id: string; name: string; customer: string; customerId: string; health: Enums<'health'>; pm: string | null
  progress: number; nextMilestone: { title: string; due: string | null; overdue: boolean } | null
  blocker: string | null; openRequests: number; oldestInvoiceDays: number | null
}
export type Exception = { severity: 'crit' | 'warn'; customer: string; issue: string; context: string; age: string; owner: string; href: string; sort: number }

/**
 * Everything the CEO/PM home needs, read under the signed-in user's own permissions.
 * Exceptions are computed from live data, never stored, so they cannot go stale.
 */
export async function loadPortfolio() {
  const supabase = await createClient()
  const [projects, tasks, approvals, requests, invoices, progress] = await Promise.all([
    supabase.from('projects').select('id, name, health, status, customer_id, customers(name), pm:profiles!projects_pm_id_fkey(full_name)').eq('status', 'active').order('name'),
    supabase.from('tasks').select('id, title, status, due_date, owner_side, project_id, assignee:profiles!tasks_assignee_id_fkey(full_name)').neq('status', 'done'),
    supabase.from('approvals').select('id, title, status, created_at, project_id, request_id, customers(name), approver:profiles!approvals_approver_id_fkey(full_name)').eq('status', 'pending'),
    supabase.from('requests').select('id, number, title, priority, status, desired_date, created_at, project_id, customers(name), owner:profiles!requests_owner_id_fkey(full_name)').not('status', 'in', '(delivered,cancelled)'),
    supabase.from('invoices').select('id, number, customer_id, due_on, balance, status, customers(name)').neq('status', 'paid'),
    supabase.from('project_progress').select('*'),
  ])
  const prog = new Map((progress.data ?? []).map((p) => [p.project_id, p]))
  const t = tasks.data ?? []

  const rows: PortfolioRow[] = (projects.data ?? []).map((p) => {
    const mine = t.filter((x) => x.project_id === p.id)
    const next = mine.filter((x) => x.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]
    const blocker = mine.find((x) => x.owner_side === 'customer' && (daysFromToday(x.due_date) ?? 1) < 0)?.title
      ?? (approvals.data ?? []).find((a) => a.project_id === p.id)?.title ?? null
    const unpaid = (invoices.data ?? []).filter((i) => i.customer_id === p.customer_id && i.due_on && (daysFromToday(i.due_on) ?? 0) < 0)
    const pr = prog.get(p.id)
    return {
      id: p.id, name: p.name, customer: p.customers?.name ?? '', customerId: p.customer_id, health: p.health, pm: p.pm?.full_name ?? null,
      progress: pr?.total ? (100 * (pr.done ?? 0)) / pr.total : 0,
      nextMilestone: next ? { title: next.title, due: next.due_date, overdue: (daysFromToday(next.due_date) ?? 0) < 0 } : null,
      blocker, openRequests: (requests.data ?? []).filter((r) => r.project_id === p.id).length,
      oldestInvoiceDays: unpaid.length ? Math.max(...unpaid.map((i) => -(daysFromToday(i.due_on) ?? 0))) : null,
    }
  })

  const ex: Exception[] = []
  for (const p of rows) {
    if (p.health === 'at_risk') ex.push({ severity: 'crit', customer: p.customer, issue: `Project at risk: ${p.name}`, context: p.nextMilestone?.overdue ? `${p.nextMilestone.title} overdue` : 'Health set to at risk', age: '', owner: p.pm ?? '–', href: `/projects/${p.id}`, sort: 0 })
  }
  for (const x of t) {
    const late = -(daysFromToday(x.due_date) ?? 1)
    if (x.owner_side === 'customer' && late > 0) {
      const p = rows.find((r) => r.id === x.project_id)
      ex.push({ severity: late > 5 ? 'crit' : 'warn', customer: p?.customer ?? '', issue: `Customer task overdue: ${x.title}`, context: p?.name ?? '', age: `${late}d`, owner: x.assignee?.full_name ?? 'Customer', href: `/projects/${x.project_id}?task=${x.id}`, sort: 2 - late / 100 })
    }
  }
  for (const a of approvals.data ?? []) {
    const days = Math.floor((Date.now() - Date.parse(a.created_at)) / 86_400_000)
    if (days >= 2) ex.push({ severity: days > 5 ? 'crit' : 'warn', customer: a.customers?.name ?? '', issue: `Waiting on customer approval: ${a.title}`, context: `Approver: ${a.approver?.full_name ?? '–'}`, age: `${days}d`, owner: a.approver?.full_name ?? '', href: a.request_id ? `/requests/${a.request_id}` : `/approvals/${a.id}`, sort: 3 - days / 100 })
  }
  for (const r of requests.data ?? []) {
    if (r.priority === 'critical') {
      const past = (daysFromToday(r.desired_date) ?? 1) < 0
      ex.push({ severity: past ? 'crit' : 'warn', customer: r.customers?.name ?? '', issue: `Critical request${past ? ' past its date' : ''}: ${r.title}`, context: r.number, age: ageInDays(r.created_at), owner: r.owner?.full_name ?? 'Unassigned', href: `/requests/${r.id}`, sort: 1 })
    }
  }
  for (const i of invoices.data ?? []) {
    const late = -(daysFromToday(i.due_on) ?? 0)
    if (late > 30) ex.push({ severity: 'crit', customer: i.customers?.name ?? '', issue: `Invoice ${i.number} overdue`, context: 'Synced from Zoho Books', age: `${late}d`, owner: 'Finance', href: '/finance', sort: 1.5 })
  }
  ex.sort((a, b) => (a.severity === b.severity ? a.sort - b.sort : a.severity === 'crit' ? -1 : 1))

  return {
    rows, exceptions: ex,
    counts: {
      atRisk: rows.filter((r) => r.health === 'at_risk').length,
      healthy: rows.filter((r) => r.health === 'on_track').length,
      critical: (requests.data ?? []).filter((r) => r.priority === 'critical').length,
      customerOverdue: t.filter((x) => x.owner_side === 'customer' && (daysFromToday(x.due_date) ?? 1) < 0).length,
      invoices30: (invoices.data ?? []).filter((i) => -(daysFromToday(i.due_on) ?? 0) > 30).length,
      approvals: (approvals.data ?? []).length,
    },
  }
}
