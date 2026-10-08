import { Avatar, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'

/** The customer's portal: the Seven Billion people on their account, with their roles. Hidden when nobody is named. */
export async function YourTeam() {
  const supabase = await createClient()
  const { data: team } = await supabase.from('customer_team')
    .select('profile_id, role_label, person:profiles!customer_team_profile_id_fkey(full_name)').order('added_at')
  if (!team?.length) return null
  return (
    <Card flush title="Your Seven Billion team">
      {team.map((t) => (
        <div key={t.profile_id} className="row min-h-10 grid-cols-[24px_minmax(0,1fr)] gap-2">
          <Avatar name={t.person?.full_name ?? '?'} />
          <span className="flex min-w-0 flex-col leading-tight"><span className="truncate text-[13px] font-medium">{t.person?.full_name}</span>
            {t.role_label ? <span className="truncate text-xs text-muted">{t.role_label}</span> : null}</span>
        </div>
      ))}
    </Card>
  )
}
