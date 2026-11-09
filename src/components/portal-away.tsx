import { Card, Empty } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** For customers: when the Seven Billion people on their work are away in the next six weeks. Dates only. */
export async function PortalAway() {
  const supabase = await createClient()
  const now = new Date()
  const from = now.toISOString().slice(0, 10)
  const to = new Date(now.getTime() + 42 * 86_400_000).toISOString().slice(0, 10)
  const { data } = await supabase.rpc('customer_team_leave', { p_from: from, p_to: to })
  return (
    <Card flush title="Who's away" description="Your Seven Billion team, next six weeks">
      {data?.length ? (
        <ul className="m-0 list-none p-0">
          {data.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-3 border-t border-border/60 px-3.5 py-2 text-[13px] first:border-t-0">
              <span className="truncate font-medium">{l.full_name}</span>
              <span className="tabular flex-none text-xs text-muted-foreground">{l.start_date === l.end_date ? `${fmt(l.start_date)}${l.half_day ? ' · half day' : ''}` : `${fmt(l.start_date)} – ${fmt(l.end_date)}`}</span>
            </li>
          ))}
        </ul>
      ) : <Empty title="Everyone is in">No planned leave on your team.</Empty>}
    </Card>
  )
}
