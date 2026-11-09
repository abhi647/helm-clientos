import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { saveCostRates } from '@/app/_actions/billing'
import { ActionForm } from '@/components/forms'
import { Card, PageHeader } from '@/components/ui'
import { hrs, isoDaysAgo, money } from '@/lib/format'
import { canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { Input } from '@/components/ui/input'

export const metadata: Metadata = { title: 'Cost rates' }

/** What an hour of each person costs Seven Billion, so every project shows its margin. Finance, admins and the CEO only. */
export default async function CostRates() {
  const me = await requireStaff()
  if (!canSeeFinance(me)) notFound()
  const supabase = await createClient()
  const [{ data: staff }, { data: costs }, { data: time }] = await Promise.all([
    supabase.from('directory').select('id, full_name, internal_role').eq('kind', 'internal').is('access_revoked_at', null).order('full_name'),
    supabase.from('cost_rates').select('profile_id, hourly_cost, updated_at'),
    supabase.from('time_entries').select('user_id, hours, billable').gte('worked_on', isoDaysAgo(30).slice(0, 10)).limit(20000),
  ])
  const cost = new Map((costs ?? []).map((c) => [c.profile_id, c]))
  const hours = (id: string, billable?: boolean) => (time ?? []).filter((t) => t.user_id === id && (billable == null || t.billable === billable)).reduce((a, t) => a + Number(t.hours), 0)
  return (
    <>
      <PageHeader title="Cost rates" meta={<span>What an hour of each person costs us · used for project margins · <Link href="/finance">Finance</Link></span>} />
      <div className="flex max-w-[960px] flex-col gap-3 p-4">
        <Card flush title="People" description="Salary and overheads per hour. Leave empty if unknown; margins then show as unknown">
          <ActionForm action={saveCostRates} submit="Save cost rates" resetOnSuccess={false} className="gap-0 [&>div:last-child]:border-t [&>div:last-child]:border-line-soft [&>div:last-child]:p-3">
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="row row-head grid-cols-[minmax(0,1fr)_110px_110px_110px_150px]"><span>Person</span><span className="text-right">Hours, 30 days</span><span className="text-right">Billable</span><span className="text-right">Cost, 30 days</span><span className="text-right">Cost per hour (INR)</span></div>
                {(staff ?? []).map((p) => {
                  const c = cost.get(p.id!)
                  const h = hours(p.id!)
                  return (
                    <div key={p.id} className="row grid-cols-[minmax(0,1fr)_110px_110px_110px_150px] py-1">
                      <span className="truncate"><span className="font-medium">{p.full_name}</span> <span className="text-xs text-muted-foreground">{p.internal_role}</span></span>
                      <span className="tabular text-right text-xs">{hrs(h)}</span>
                      <span className="tabular text-right text-xs">{h ? `${Math.round((100 * hours(p.id!, true)) / h)}%` : '–'}</span>
                      <span className="tabular text-right text-xs">{c ? money(h * Number(c.hourly_cost), 'INR') : '–'}</span>
                      <Input name={`cost_${p.id}`} aria-label={`Cost per hour for ${p.full_name}`} defaultValue={c ? String(c.hourly_cost) : ''} inputMode="decimal" placeholder="Unknown" className="w-auto tabular text-right" />
                    </div>
                  )
                })}
              </div>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
